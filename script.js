var a_status = document.getElementById("status");

var seq = null;
// var sf = null;
/**
 * @type {SimpleMidiSequencer}
 */
var sms = null;
var actx = new AudioContext({sampleRate: 44100});
var sb;

/**
 * @type {HTMLCanvasElement}
 */
var canvas = document.getElementById("fallingnotes");
var canvas_ctx = canvas.getContext("2d");
var fallingNotes = new FallingNotes(new Piano());
canvas.width = fallingNotes.width;
canvas.height = fallingNotes.height + fallingNotes.piano.height;

(async ()=>{
    if ("serviceWorker" in navigator) {
        try {
            await navigator.serviceWorker.register("service_worker.js", {
                scope: location.pathname,
            });
        } catch (error) {
            console.error(`Registration failed with ${error}`);
        }
    }

    a_status.innerText = "Loading...";
    let pitches = await (await fetch("./samples/pitches.json")).json();
    let bufs = Array(128);
    let i_com = 0;
    a_status.innerText = `Loading (0/127)...`;
    let arr = [];
    for (let i=0;i<128;i++) {
        arr.push((async ()=>{
            let buf = await actx.decodeAudioData(await (await fetch(`./samples/${i}.wav`)).arrayBuffer());
            buf.basePitch = pitches[i];
            bufs[i] = buf;
            i_com++;
            a_status.innerText = `Loading (${i_com}/127)...`;
        })());
    }
    await Promise.all(arr);
    sb = new SoundBank(bufs);
    a_status.innerText ="";
})();

document.getElementById("filein").addEventListener("change", async e => {
    try {
        let file = e.target.files.item(0);
        a_status.innerText = "Loading file...";
        let buf = await file.arrayBuffer();
        a_status.innerText = "Parsing file...";
        seq = Midifile.parse(buf);
        console.log(seq);
        if (sms != null && sms.isPlaying()) {
            sms.reset();
            sms.stop();
            document.getElementById("cont").innerText = "Play";
        }
        sms = new SimpleMidiSequencer(seq, sb, actx);
        sms.gnode.gain.value = document.querySelector("input#volume").valueAsNumber;
        sms.speed = document.querySelector("input#speed").valueAsNumber;
        sms.addEventListener("ended", ()=>document.getElementById("cont").innerText = "Play")
        sms.addEventListener("tickupdate", update_status);
        sms.addEventListener("bpmchange", update_status);
        update_status();
        fallingNotes.piano.player = sms;
        fallingNotes.piano.noteMap = new NoteMap(seq);
        render();
    } catch (err) {
        console.error(err);
        a_status.innerText = err;
    }
});
function update_status() {
    a_status.innerText = `bpm: ${sms.status.bpm.toFixed(2)} tickpos: ${sms.currentTick}/${sms.seq.length}`;
}
function render() {
    canvas_ctx.clearRect(0, 0, canvas.width, canvas.height);
    fallingNotes.paint(canvas_ctx);
    fallingNotes.piano.paint(canvas_ctx);
    if (sms) {
        canvas_ctx.fillStyle = "lightgray";
        canvas_ctx.fillRect(0, 0, sms.currentTick*canvas.width/sms.seq.length, 5);
        canvas_ctx.fillStyle = "white";
        canvas_ctx.fillText(sms.currentTick, 2, 18);
        if (sms.playing)
            requestAnimationFrame(render);
    }
}
render();

// document.getElementById("soundfont").addEventListener("change", async e => {
//     let file = e.target.files.item(0);
//     let buf = await file.arrayBuffer();
//     sf = new SoundFont2.SoundFont2(new Uint8Array(buf));
//     console.log(sf);
// });

document.getElementById("cont").addEventListener("click", e => {
    if (sms.isPlaying()) {
        sms.reset();
        sms.stop();
    } else {
        sms.start();
        render();
    }
    e.target.innerText = sms.isPlaying() ? "Stop" : "Play";
});

document.querySelector("input#volume").addEventListener("input", e => {
    let val = e.target.valueAsNumber;
    if (sms != null)
        sms.gnode.gain.value = val;
    document.querySelector("a#volume").innerText = `${parseInt(val*100)}%`
});

document.querySelector("input#speed").addEventListener("input", e => {
    let val = e.target.valueAsNumber;
    if (sms != null)
        sms.speed = val;
    document.querySelector("a#speed").innerText = `${parseInt(val*100)}%`
});