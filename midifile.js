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
            seq.length = Math.max(seq.length, seq.tracks[i].length);
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
            track.length += dt;

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
        this.length = 0;
    }
}

class MidiTrack {
    /**
     * 
     * @param {MidiTrackEvent[]} events 
     */
    constructor(events = []) {
        this.events = events;
        this.length = 0;
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

class SimpleMidiSequencer extends EventTarget {
    /**
     * @param {MidiSequence} sequence
     * @param {SimpleMidiSynthesizer} synthesizer
     */
    constructor(sequence, synthesizer = new SimpleMidiSynthesizer()) {
        super();
        this.class = SimpleMidiSequencer;
        this.seq = sequence;
        this.synthesizer = synthesizer;
        
        this.event_pos = Array(this.seq.tracks.length).fill(0);
        this.event_tl = Array(this.seq.tracks.length).fill(0);
        this.speed = 1;

        this.loop_timeout = -1;
        this._last_update_tick_pos = 0;
        this._time_after_tp = 0;
        this.currentInterval = 0;
        this.status = {
            bpm: 0
        };
        this.playing = false;
    }
    _tick() {
        let tl = this.seq.tracks.length;
        for (let i=0;i<this.seq.tracks.length;i++) {
            if (this.event_pos[i] >= this.seq.tracks[i].events.length) {
                tl--;
                this.event_tl[i] = Infinity;
                continue;
            }
            if (this.event_tl[i] > 0)
                continue;
            do
                this.synthesizer.process_event(this.seq.tracks[i].events[this.event_pos[i]++]);
            while (this.event_pos[i] < this.seq.tracks[i].events.length && this.seq.tracks[i].events[this.event_pos[i]].dt == 0);
            if (this.event_pos[i] >= this.seq.tracks[i].events.length) {
                tl--;
                this.event_tl[i] = Infinity;
                continue;
            }
            this.event_tl[i] = this.seq.tracks[i].events[this.event_pos[i]].dt;
            // console.log(i, this.event_pos[i]);
        }
        return tl > 0;
    }
    async _run() {
        this._st = Date.now();
        while (this.playing) {
            this._ndt = Math.min(...this.event_tl);
            for (let i in this.event_tl)
                this.event_tl[i] -= this._ndt;
            this.dispatchEvent(new Event("tickupdate"));
            let ct = Date.now();
            this.currentInterval = this.synthesizer.tick_delay/1000/this.seq.division;
            this.status.bpm = 60000000/this.synthesizer.tick_delay;
            let dt = this.currentInterval * this._ndt / this.speed;// - (ct - this._st);
            this._st = ct;
            if (dt > 0)
                this.loop_timeout = await new Promise((res)=>setTimeout(res, dt));
            this._last_update_tick_pos += this._ndt;
            if (!this._tick())
                break;
        }
        if (this.playing) {
            this.stop();
            this.dispatchEvent(new Event("ended"));
        }
    }
    get currentTick() {
        if (this.playing)
            this._time_after_tp = Date.now() - this._st;
        return this._last_update_tick_pos + (parseInt(this._time_after_tp * this.speed / this.currentInterval) || 0);
    }
    start() {
        this.playing = true;
        this._run();
    }
    reset() {
        this.event_pos.fill(0);
        this.event_tl.fill(0);
        this._st = Date.now();
        this._ndt = 0;
        this.status.bpm = 120;
        this.currentInterval = 60000/this.seq.division/this.status.bpm;
        this._last_update_tick_pos = 0;
        this._time_after_tp = 0;
    }
    stop() {
        this.playing = false;
        clearTimeout(this.loop_timeout);
        this.loop_timeout = -1;
        let tp = Math.min(this.currentTick - this._last_update_tick_pos, this._ndt);
        this._time_after_tp = tp * this.currentInterval / this.speed;
        for (let i in this.event_tl) {
            this.event_tl[i] -= tp;
        }
    }
}