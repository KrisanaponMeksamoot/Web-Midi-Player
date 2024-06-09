document.getElementById("filein").addEventListener("change", async e => {
    let file = e.target.files.item(0);
    console.log(file);
    let buf = await file.arrayBuffer();
    let seq = Midifile.parse(buf);
    console.log(seq);
});