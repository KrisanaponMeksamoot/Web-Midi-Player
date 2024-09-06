class NoteMap {
    /**
     * 
     * @param {MidiSequence} seq 
     */
    constructor(seq) {
        this.sequence = seq;
        this.duration = seq.length;
        let note_events = [];
        let t = 0;
        for (let track of seq.tracks) {
            let clen = 0;
            for (let i in track.events) {
                let msg = track.events[i];
                if (!(msg instanceof MidiEvent))
                    continue;
                switch (msg.status & 0xF0) {
                    case 0x80:
                    case 0x90:
                    case 0xA0:
                        note_events
                                .push(new NoteMap.NoteEvent(t, clen+=msg.dt, msg.status & 0x0F, msg.data, msg.data2,
                                        (msg.status & 0xF0) != 0x80));
                }
            }
            t++;
        }
        note_events = note_events.sort(NoteMap.NoteEvent_compare);
        // System.out.println(note_events);
        let note_indexes = Array(127).fill(null);
        let notes = [];
        for (let ne of note_events) {
            let recent_note = note_indexes[ne.note];
            if (recent_note != null && recent_note.channel != ne.channel)
                recent_note = null;
            if (ne.on) {
                notes.push(note_indexes[ne.note] = ne.toNote(this.sequence.division));
            }
            if (recent_note != null && recent_note.getEndTime() > ne.time) {
                recent_note.duration = ne.time - recent_note.startTime;
            }
        }
        this.notes_range_count = 0;
        for (let i = 0; i < 127; i++) {
            let recent_note = note_indexes[i];
            if (recent_note != null) {
                if (recent_note.getEndTime() > this.duration)
                    recent_note.duration = this.duration - recent_note.startTime;
                this.notes_range_count++;
            }
        }
        this.notes = notes.sort(Note.compareByChannel);
    }

    notesAt(notes, time) {
        let currentNotei = binarySearchFloor(notes, new Note(-1, time, -1), Note.compareByChannel);
        let currentNote = this.notes[currentNotei];
        let ns = Array(127).fill(false);
        let count = 0;
        while (currentNote != null && count < this.notes_range_count) {
            if (currentNote.inside(time))
                notes[currentNote.note] = 1;
            if (!ns[currentNote.note]) {
                count++;
                ns[currentNote.note] = true;
            }

            currentNote = this.notes[--currentNotei];
        }
    }

    noteBefore(end) {
        return this.notes.slice(0, binarySearchFloor(this.notes, new Note(-1, end, -1), Note.compareByChannel));
    }

    static NoteEvent = class NoteEvent {
        constructor(track, start, channel, note, velocity, on) {
            this.track = track;
            this.time = start;
            this.channel = channel + 16 * track;
            this.note = note;
            this.velocity = velocity;
            this.on = on;
        }

        toNote(res) {
            return new Note(this.note, this.time, this.channel, this.velocity * res / 100);
        }

        toString() {
            return `${this.time} ${this.channel} ${this.note} ${this.on ? "on" : "off"}`;
        }
    }

    static NoteEvent_compare(n2, n1) {
        let res = n1.channel - n2.channel;
        if (res > 0)
            return 1;
        else if (res < 0)
            return -1;
        res = n2.time - n1.time;
        if (res > 0)
            return 1;
        else if (res < 0)
            return -1;
        return n2.note - n1.note;
    }
}

class Note {
    constructor(note, startTime, channel, duration=-1) {
        this.note = note;
        this.startTime = startTime;
        this.channel = channel;
        this.duration = duration;
    }

    getEndTime() {
        return this.startTime + this.duration;
    }

    inside(time) {
        return this.startTime <= time && time <= this.startTime + this.duration;
    }

    static compare(n1, n2) {
        let res = n1.startTime - n2.startTime;
        if (res > 0)
            return 1;
        else if (res < 0)
            return -1;
        res = n2.channel - n1.channel;
        if (res > 0)
            return 1;
        else if (res < 0)
            return -1;
        res = n2.note - n1.note;
        if (res > 0)
            return 1;
        else if (res < 0)
            return -1;
        return 0;
    }

    static compareByChannel(n2, n1) {
        let res = n1.channel - n2.channel;
        if (res > 0)
            return 1;
        else if (res < 0)
            return -1;
        res = n2.startTime - n1.startTime;
        if (res > 0)
            return 1;
        else if (res < 0)
            return -1;
        res = n2.note - n1.note;
        if (res > 0)
            return 1;
        else if (res < 0)
            return -1;
        return 0;
    }

    equals(o) {
        if (!(o instanceof Note))
            return false;
        return o.channel == channel && o.note == note && o.startTime == startTime;
    }

    equalsByNote(o) {
        if (!(o instanceof Note))
            return false;
        return o.channel == channel && o.note == note;
    }
}

class FallingNotes {
    constructor(piano) {
        this.piano = piano;
        this.scale = 10;

        this.width = 750;
        this.height = 300;
    }

    /**
     * 
     * @param {CanvasRenderingContext2D} g 
     * @returns 
     */
    paint(g) {
        if (this.piano.player == null)
            return;

        let colors = [ "#0f0", "blue", "#fa0", "#f00", "yellow", "pink", "#0ff" ];

        let time = this.piano.player.getTick();

        let nw = [ true, false, true, false, true, true, false, true, false, true, false, true ];
        let nx = [ 0, 8, 10, 18, 20, 30, 38, 40, 48, 50, 58, 60 ];

        for (let note of this.piano.noteMap
                .noteBefore(this.piano.player.getTick() + this.width * this.scale)) {
            if (note.getEndTime() < time)
                continue;

            let n = note.note;
            let x = parseInt(n / 12) * 7 * 10 + nx[n % 12];

            let c = note.channel;
            g.fillStyle = colors[((c & 0xf) + (c >> 4)) % colors.length];

            let h = parseInt(note.duration / this.scale);

            g.fillRect(x, this.height - (note.startTime - time) / this.scale - h, nw[n % 12] ? 10 : 5,
                    h);
        }
    }
}

class Piano {
    constructor() {
        this.player = null;
        this.noteMap = null;
        let k = [ true, false, true, false, true, true, false, true, false, true, false, true ];

        this.keys = Array(127);
        for (let i = 0; i < 127; i++) {
            this.keys[i] = k[i % 12] ? Piano.Key.WhiteKey : Piano.Key.BlackKey;
        }

        this.status = Array(127).fill(0);

        this.width = 750;
        this.height = 50;
        this.y = 300;
    }

    /**
     * 
     * @param {CanvasRenderingContext2D} g 
     */
    paint(g) {
        g.fillStyle = "white";
        g.fillRect(0, this.y, this.width, this.height);
        this.reset();
        if (this.player != null)
            this.noteMap.notesAt(this.status, this.player.getTick());
        g.strokeStyle = "black";
        let x = 0;
        for (let i in this.keys) {
            let key = this.keys[i];
            if (key == Piano.Key.WhiteKey)
                x += key.render(g, x, this.y, this.status[i]);
        }
        x = 0;
        for (let i in this.keys) {
            let key = this.keys[i];
            if (key == Piano.Key.WhiteKey)
                x += 10;
            else
                key.render(g, x, this.y, this.status[i]);
        }
    }

    static Key = class Key {
        static WhiteKey = new Key();
        static BlackKey = new Key();

        /**
         * 
         * @param {CanvasRenderingContext2D} g 
         * @param {number} x 
         * @param {number} status 
         * @returns 
         */
        render(g, x, y, status) {
            if (this == Key.WhiteKey) {
                g.beginPath();
                g.moveTo(x, y);
                g.lineTo(x + 10, y);
                g.lineTo(x + 10, y + 50);
                g.lineTo(x, y + 50);
                g.closePath();
                g.stroke();

                if (status > 0) {
                    g.fillStyle = "lime";
                    g.fillRect(x + 1, y + 1, 8, 48);
                }

                return 10;
            } else {
                g.fillStyle = "black";
                g.fillRect(x - 2, y, 5, 25);

                if (status > 0) {
                    g.fillStyle = "lime"
                    g.fillRect(x - 1, y, 3, 23);
                }

                return 0;
            }
        }
    }

    reset() {
        for (let i = 0; i < 127; i++) {
            this.status[i] = 0;
        }
    }
}