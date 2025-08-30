class TonejsMidiSynthesizer {
    constructor(actx = Tone.getContext().rawContext, options = []) {
        this.actx = actx;

        this.gnode = new Tone.Gain(1).toDestination();
        this.tick_delay = 120;
        this.channels = Array(16);
        this.soundbank = options;
    }

    get soundbank() { return this._options; }
    set soundbank(options) {
        this._options = options?.buffers ?? [];
        for (let i=0;i<16;i++) {
            this.channels[i] = this._new_tone_sampler(this.channels[i]?.patch ?? 0);
        }
    }

    _new_tone_sampler(patch) {
        if (!this._options[patch]) return null;
        return new Tone.Sampler({
                urls: { [Tone.Frequency(this._options[patch].basePitch, "midi").toNote()]: this._options[patch] },
                release: 1,
                baseUrl: this._options.baseUrl
            }).connect(this.gnode);
    }

    /**
     * 
     * @param {MidiTrackEvent} e 
     */
    async process_event(e) {
        if (e instanceof MetaEvent) {
            switch (e.type) {
                case 0x51:
                    this.tick_delay = (e.data[0]<<16 | e.data[1]<<8 | e.data[2]);
                    break;
            }
        } else if (e instanceof MidiEvent) {
            switch (e.status & 0xF0) {
                case 0x80:
                    this._stop_sound(e.status & 0x0F, e.data, e.data2);
                    break;
                case 0x90:
                case 0xA0:
                    this._play_sound(e.status & 0x0F, e.data, e.data2);
                    break;
                case 0xB0:
                    this._change_control(e.status & 0x0F, e.data, e.data2);
                    break;
                case 0xC0:
                    this._change_patch(e.status & 0x0F, e.data);
                    break;
                case 0xD0:
                    let mx = 0;
                    let kys = this.channels[e.status & 0x0F].map(a=>a==null?0:a.volume);
                    for (let i in kys)
                        if (kys[i] > kys[mx])
                            mx = i;
                    this._play_sound(e.status & 0x0F, mx, e.data);
                    break;
                default:
                    console.warn(`Unimplemented midi-event: 0x${e.status.toString(16)}`);
            }
        }
    }

    _play_sound(chan, key, vel) {
        this.channels[chan]?.triggerAttack(Tone.Frequency(key, "midi"), undefined, vel / 127);
    }

    _stop_sound(chan, key) {
        this.channels[chan]?.triggerRelease(Tone.Frequency(key, "midi"));
    }

    _change_patch(chan, patch) {
        if (this.channels[chan]?.patch == patch)
        this.channels[chan] = this._new_tone_sampler(patch);
    }

    _change_control(chan, control, value) {
        switch (control) {
            case 0x7: case 0x27:
                if (!this.channels[chan]) break;
                this.channels[chan].volume.value = Tone.gainToDb(value / 127); break;
            case 0x40:
                // sustain/damper logic can be added here
                break;
            case 0x79:
                this.channels.forEach(ch => ch.releaseAll()); break;
            case 0x7B:
                this.channels.forEach(ch => ch.releaseAll()); break;
            default:
                console.warn(`Unimplemented control change: 0x${control.toString(16)}`);
        }
    }

}
