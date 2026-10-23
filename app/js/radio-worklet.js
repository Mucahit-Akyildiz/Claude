/* Telsiz mikrofon yakalama: ses iş parçacığında gelen kareleri ana iş parçacığına iletir
   (eski ScriptProcessor bazı yeni Chrome/Windows kurulumlarında sessiz kare veriyor). */
class RadioCapture extends AudioWorkletProcessor {
  constructor(){ super(); this.buf = new Float32Array(2048); this.n = 0; }
  process(inputs){
    const inp = inputs[0];
    if(inp && inp.length){
      const L = inp[0], R = inp[1];
      for(let i = 0; i < L.length; i++){
        this.buf[this.n++] = R ? (L[i] + R[i]) / 2 : L[i];
        if(this.n === this.buf.length){ this.port.postMessage(this.buf.slice(0)); this.n = 0; }
      }
    }
    return true;
  }
}
registerProcessor('radio-capture', RadioCapture);
