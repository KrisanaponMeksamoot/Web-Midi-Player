var seq = null;
// var sf = null;
var sms = null;

document.getElementById("filein").addEventListener("change", async e => {
    let file = e.target.files.item(0);
    let buf = await file.arrayBuffer();
    seq = Midifile.parse(buf);
    console.log(seq);
    sms = new SimpleMidiSequencer(seq, new SoundBank());
});

// document.getElementById("soundfont").addEventListener("change", async e => {
//     let file = e.target.files.item(0);
//     let buf = await file.arrayBuffer();
//     sf = new SoundFont2.SoundFont2(new Uint8Array(buf));
//     console.log(sf);
// });

document.getElementById("cont").addEventListener("click", e => {
    sms.isPlaying() ? sms.stop() : sms.start();
    e.target.innerText = sms.isPlaying() ? "Stop" : "Play";
});