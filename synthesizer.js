class SoundBank {
    constructor(buffers = Array(127)) {
        this.buffers = buffers;
    }
    getBuffer(num) {
        return this.buffers[num];
    }
}

class SimpleMidiSynthesizer {
    constructor(actx = new AudioContext(), soundbank = new SoundBank()) {
        this.class = SimpleMidiSynthesizer;
        this._sb = soundbank;
        this.actx = actx;
        this.gnode = this.actx.createGain();
        this.gnode.connect(this.actx.destination);
        this.channels = Array(16).fill(null).map(_=>new this.class.AudioChannel(this.actx, soundbank.getBuffer(0), this.gnode));

        this.tick_delay = 120;
    }
    set soundbank(val) {
        this._sb = val;
        this.channels.forEach(c=>c.buffer = this._sb.getBuffer(c.patch));
    }
    get soundbank() {
        return this._sb;
    }
    /**
     * 
     * @param {MidiTrackEvent} e 
     */
    process_event(e) {
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
    _change_patch(chan, patch) {
        this.channels[chan].buffer = this._sb.getBuffer(patch);
    }
    _change_control(chan, control, value) {
        switch (control) {
            case 0x7:
            case 0x27:
                this.channels[chan].gnode.gain.value = value/127;
                break;
            case 0x40:
                this.channels[chan].damper = value > 63;
                break;
            case 0x79:
                this.channels.forEach(ch=>ch.reset());
                break;
            case 0x7B:
                this.channels.forEach(ch=>ch.stopAll());
                break;
            default:
                console.warn(`Unimplemented control change: 0x${control.toString(16)}`);
        }
    }
    _play_sound(chan, key, vel) {
        this.channels[chan].getNode(key).play(vel/127);
    }
    _stop_sound(chan, key, vel) {
        this.channels[chan].getNode(key).stop();
    }
    static AudioChannel = class AudioChannel {
        /**
         * @param {BaseAudioContext} actx 
         * @param {AudioBuffer} buffer 
         */
        constructor(actx, buffer, destination = actx.destination) {
            this.class = AudioChannel;
            this.actx = actx;
            this.buffer = buffer;
            this.patch = 0;
            this.nodes = Array(127).fill(null);
            this.gnode = this.actx.createGain();
            this.gnode.connect(destination);

            this._damper = false;
        }
        getNode(note) {
            if (this.nodes[note] == null)
                this.nodes[note] = new this.class.AudioNode(this, Math.min(Math.max(Math.pow(2, (note-this.buffer.basePitch)/12), 0.0625), 128));
            return this.nodes[note];
        }
        static AudioNode = class AudioNode {
            /**
             * @param {AudioChannel} channel 
             * @param {number} pbrate 
             */
            constructor(channel, pbrate = 1) {
                this.channel = channel;
                this.pbrate = pbrate;
                this.gnode = this.channel.actx.createGain();
                this.gnode.connect(this.channel.gnode);
                this.bs = null;

                this.playing = false;
            }
            play(vol = 1) {
                this.playing = true;
                if (this.bs != null)
                    this.bs.stop();
                this.bs = this.channel.actx.createBufferSource();
                this.bs.connect(this.gnode);
                this.gnode.gain.value = vol;
                this.bs.playbackRate.value = this.pbrate;
                this.bs.buffer = this.channel.buffer;
                this.bs.start();
            }
            stop() {
                if (!this.playing) return;
                this.playing = false;
                if (!this.channel._damper)
                    this.bs.stop();
            }
        };
        set damper(press) {
            this._damper = press;
            if (!this._damper)
                this.nodes.forEach(an=>{
                    if (an == null) return;
                    if (!an.playing)
                        an.stop();
                });
        }

        get damper() {
            return this._damper;
        }

        reset() {
            this.nodes.forEach(an=>{
                if (an == null) return;
                an.gnode.gain.value = 1;
            });
            this.gnode.gain.value = 1;

            this.damper = false;
        }

        stopAll() {
            this.nodes.forEach(an=>an.stop());
        }
    };
}