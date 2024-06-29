var a_status = document.getElementById("status");

var seq = null;
// var sf = null;
var sms = null;
var actx = new AudioContext({sampleRate: 44100});
var sb;

(async ()=>{
    a_status.innerText = "Loading...";
    let pitches = await (await fetch("./samples/pitches.json")).json();
    let bufs = [];
    for (let i=0;i<128;i++) {
        a_status.innerText = `Loading (${i}/127)...`;
        let buf = await actx.decodeAudioData(await (await fetch(`./samples/${i}.wav`)).arrayBuffer());
        buf.basePitch = pitches[i];
        bufs.push(buf);
    }
    sb = new SoundBank(bufs);
    a_status.innerText ="";
})();

document.getElementById("filein").addEventListener("change", async e => {
    let file = e.target.files.item(0);
    let buf = await file.arrayBuffer();
    a_status.innerText = "Parsing file...";
    seq = Midifile.parse(buf);
    console.log(seq);
    sms = new SimpleMidiSequencer(seq, sb, actx);
    sms.gnode.gain.value = document.getElementById("volume").valueAsNumber/100;
    sms.addEventListener("ended", ()=>document.getElementById("cont").innerText = "Play")
    a_status.innerText ="";
});

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
    }
    e.target.innerText = sms.isPlaying() ? "Stop" : "Play";
});

document.getElementById("volume").addEventListener("input", e => {
    if (sms != null)
        sms.gnode.gain.value = e.target.valueAsNumber/100;
});