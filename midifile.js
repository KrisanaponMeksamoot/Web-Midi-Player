class Midifile {
    /**
     * 
     * @param {ArrayBuffer} buffer 
     */
    static parse(buffer) {
        let view = new DataView(buffer);
        if (view.getUint32(0) != 0x4D546864)
            throw new MidiMulformError("Invalid MThd");
        let headlen = view.getUint32(4);
        if (headlen < 6)
            throw new MidiMulformError("Invalid first chunk length");
        let seq = new MidiSequence(Array(view.getUint16(10)));
        seq.format = view.getUint16(8);
        seq.division = view.getUint16(12);
        let ofs = 8+headlen;
        for (let i=0;i<seq.tracks.length;i++) {
            view = new DataView(buffer, ofs, 8);
            if (view.getUint32(0) != 0x4D54726B)
                throw new MidiMulformError("Invalid MTrk");
            let len = view.getUint32(4);
            // console.log(`track ${i} ${ofs} ${len}`);
            seq.tracks[i] = this._parseMTrk(new DataView(buffer, ofs+8, len));
            ofs += 8+len;
        }
        if (ofs < buffer.byteLength)
            console.warn(`Unreaded bytes ${ofs}-${buffer.byteLength}`);
        return seq;
    }
    /**
     * @param {DataView} view 
     * @returns 
     */
    static _parseMTrk(view) {
        let track = new MidiTrack();
        let ofs = 0;
        let lastCmd;
        while (ofs < view.byteLength) {
            let rb;
            let dt = 0;
            do {
                rb = view.getUint8(ofs++);
                dt <<= 7;
                dt |= rb & 0x7f;
            } while ((rb & 0x80) > 0);

            let type = view.getUint8(ofs++);
            if (type == 0xF0 || type == 0xF7) {
                let len = 0;
                do {
                    rb = view.getUint8(ofs++);
                    len <<= 7;
                    len |= rb & 0x7f;
                } while ((rb & 0x80) > 0);
                track.events.push(new SysexEvent(dt, type, new Uint8Array(view.buffer, view.byteOffset+ofs, len)));
                ofs += len;
            } else if (type == 0xFF) {
                type = view.getUint8(ofs++);
                if (type > 127)
                    throw new MidiMulformError(`meta-event type > 127 at ${ofs+view.byteOffset}`);
                let len = 0;
                do {
                    rb = view.getUint8(ofs++);
                    len <<= 7;
                    len |= rb & 0x7f;
                } while ((rb & 0x80) > 0);
                track.events.push(new MetaEvent(dt, type, new Uint8Array(view.buffer, view.byteOffset+ofs, len)));
                ofs += len;
            } else {
                switch (type & 0xF0) {
                    case 0x80:
                    case 0x90:
                    case 0xA0:
                    case 0xB0:
                    case 0xE0:
                        lastCmd = type;
                        track.events.push(new MidiEvent(dt, type, view.getUint8(ofs++), view.getUint8(ofs++)));
                        break;
                    case 0xC0:
                    case 0xD0:
                        lastCmd = type;
                        track.events.push(new MidiEvent(dt, type, view.getUint8(ofs++)));
                        break;
                    case 0xF0: {
                        if (type == 0xF0) {
                            throw Error("wtf");
                        } else if (type == 0xF2) {
                            track.events.push(new MidiEvent(dt, type, view.getUint8(ofs++), view.getUint8(ofs++)));
                        } else if (type == 0xF3) {
                            track.events.push(new MidiEvent(dt, type, view.getUint8(ofs++)));
                        } else {
                            track.events.push(new MidiEvent(dt, type));
                        }
                    } break;
                    default:
                        track.events.push(new MidiEvent(dt, lastCmd, type, view.getUint8(ofs++)));
                }
            }
        }
        return track;
    }
}

class MidiSequence {
    /**
     * 
     * @param {MidiTrack[]} tracks 
     */
    constructor(tracks) {
        this.tracks = tracks;
        this.format = -1;
        this.division = -1;
    }
}

class MidiTrack {
    /**
     * 
     * @param {MidiTrackEvent[]} events 
     */
    constructor(events = []) {
        this.events = events;
    }
}

class MidiTrackEvent {
    /**
     * @param {number} dt
     */
    constructor(dt) {
        this.dt = dt;
    }
}

class MidiEvent extends MidiTrackEvent {
    /**
     * @param {number} dt
     * @param {number} status
     * @param {number} data
     * @param {number} data2
     */
    constructor(dt, status, data, data2 = 0) {
        super(dt);
        this.status = status;
        this.data = data;
        this.data2 = data2;
    }
}

class SysexEvent extends MidiTrackEvent {
    /**
     * @param {number} dt
     * @param {number} fb
     * @param {Uint8Array} data
     */
    constructor(dt, fb, data, ) {
        super(dt);
        this.fb = fb;
        this.data = data;
    }
}

class MetaEvent extends MidiTrackEvent {
    /**
     * @param {number} dt
     * @param {number} type
     * @param {Uint8Array} data
     */
    constructor(dt, type, data) {
        super(dt);
        this.type = type;
        this.data = data;
    }
}

class MidiMulformError extends Error {
    constructor(message) {
        super(message);
    }
}

class SoundBank {
    constructor(buffers = Array(127)) {
        this.buffers = buffers;
    }
    getBuffer(num) {
        return this.buffers[num];
    }
}

class SimpleMidiSequencer {
    /**
     * @param {MidiSequence} sequence
     * @param {SoundBank} soundbank
     */
    constructor(sequence, soundbank, actx = new AudioContext()) {
        this.class = SimpleMidiSequencer;
        this.seq = sequence;
        this.loop_timeout = -1;
        this.event_pos = Array(this.seq.tracks.length).fill(0);
        this.event_tl = Array(this.seq.tracks.length).fill(0);
        this.sb = soundbank;
        this.actx = actx;
        this.gnode = this.actx.createGain();
        this.gnode.connect(this.actx.destination);
        this.channels = Array(16).fill(null).map(_=>new this.class.AudioChannel(this.actx, soundbank.getBuffer(0), this.gnode));
        this.currentInterval = 0;
        this.playing = false;
    }
    _tick(this0 = this) {
        if (!this0.playing)
            return;
        let tl = this0.seq.tracks.length;
        for (let i=0;i<this0.seq.tracks.length;i++) {
            if (this0.event_pos[i] >= this0.seq.tracks[i].events.length) {
                tl--;
                this0.event_tl[i] = Infinity;
                continue;
            }
            if (this0.event_tl[i] > 0)
                continue;
            this0._process_event(this0.seq.tracks[i].events[this0.event_pos[i]++]);
            while (this0.event_pos[i] < this0.seq.tracks[i].events.length && this0.seq.tracks[i].events[this0.event_pos[i]].dt == 0)
                this0._process_event(this0.seq.tracks[i].events[this0.event_pos[i]++]);
            if (this0.event_pos[i] >= this0.seq.tracks[i].events.length) {
                tl--;
                this0.event_tl[i] = Infinity;
                continue;
            }
            this0.event_tl[i] = this0.seq.tracks[i].events[this0.event_pos[i]].dt;
            // console.log(i, this0.event_pos[i]);
        }
        if (tl > 0) {
            let ndt = Math.min(...this0.event_tl);
            for (let i in this0.event_tl)
                this0.event_tl[i] -= ndt;
            // console.log("delay", this0.currentInterval, ndt, this0.currentInterval*ndt);
            this0.loop_timeout = setTimeout(this0._tick, this0.currentInterval * ndt, this0);
        } else {
            this0.stop();
        }
    }
    /**
     * 
     * @param {MidiTrackEvent} e 
     */
    _process_event(e) {
        if (e instanceof MetaEvent) {
            switch (e.type) {
                case 0x51:
                    this.currentInterval = e.data[0]*64/this.seq.division;
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
        this.channels[chan].buffer = this.sb.getBuffer(patch);
    }
    _change_control(chan, control, value) {
        switch (control) {
            case 0x27:
                this.channels[chan].gnode.gain.value = value/127;
                break;
            case 0x40:
                this.channels[chan].damper = value > 64;
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
    start() {
        this.event_pos.fill(0);
        this.event_tl.fill(0);
        this.currentInterval = 60000/this.seq.division/120;
        this.playing = true;
        this.loop_timeout = setTimeout(this._tick, this.currentInterval, this);
    }
    isPlaying() {
        return this.loop_timeout != -1;
    }
    stop() {
        clearTimeout(this.loop_timeout);
        this.loop_timeout = -1;
        this.playing = false;
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
    };
}