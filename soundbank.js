class SoundBank {
    constructor(buffers = Array(127)) {
        this.buffers = buffers;
    }
    getBuffer(num) {
        return this.buffers[num];
    }
}
