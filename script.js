var a_status = document.getElementById("status");

var seq = null;
// var sf = null;
var sms = null;
var actx = new AudioContext({sampleRate: 44100});
var sb;

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
        sms = new SimpleMidiSequencer(seq, sb, actx);
        sms.gnode.gain.value = document.getElementById("volume").valueAsNumber/100;
        sms.addEventListener("ended", ()=>document.getElementById("cont").innerText = "Play")
        a_status.innerText = "";
    } catch (err) {
        a_status.innerText = err;
    }
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