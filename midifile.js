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
            console.log(`track ${i} ${ofs} ${len}`);
            seq.tracks[i] = this._parseMTrk(new DataView(buffer, ofs+8, len));
            ofs += 8+len;
        }
        return seq;
    }
    /**
     * @param {DataView} view 
     * @returns 
     */
    static _parseMTrk(view) {
        let track = new MidiTrack();
        let ofs = 0;
        while (ofs < view.byteLength) {
            let rb;
            let dt = 0;
            do {
                rb = view.getUint8(ofs++);
                dt <<= 7;
                dt |= rb & 0x7f;
            } while ((rb & 0x80) > 0);

            let type = view.getUint8(ofs);
            if (type == 0xF0 || type == 0xF7) {
                let len = 0;
                do {
                    rb = view.getUint8(ofs++);
                    len <<= 7;
                    len |= rb & 0x7f;
                } while ((rb & 0x80) > 0);
                track.events.push(new SysexEvent(dt, type, new Uint8Array(view.buffer, view.byteOffset+ofs)));
                ofs += len;
            } else if (type == 0xFF) {
                type = 0;
                do {
                    rb = view.getUint8(ofs++);
                    type <<= 7;
                    type |= rb & 0x7f;
                } while ((rb & 0x80) > 0);
                let len = 0;
                do {
                    rb = view.getUint8(ofs++);
                    len <<= 7;
                    len |= rb & 0x7f;
                } while ((rb & 0x80) > 0);
                track.events.push(new MetaEvent(dt, type, new Uint8Array(view.buffer, view.byteOffset+ofs)));
                ofs += len;
            } else {
                switch (type & 0xF0) {
                    case 0x80:
                    case 0x90:
                    case 0xA0:
                    case 0xB0:
                    case 0xE0:
                        track.events.push(new MidiEvent(dt, type, view.getUint8(ofs++), view.getUint8(ofs++)));
                        break;
                    case 0xC0:
                    case 0xD0:
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
    constructor() {
        this.events = [];
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
