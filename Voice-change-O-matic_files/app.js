document.getElementById("start-btn").addEventListener("click", (e) => {
  start();
});

var myTimer ={};
myTimer.time = performance.now();
myTimer.a = 0;
myTimer.tick = function () {
  //console.log(Date.now())
  this.a++;
  let newTime = performance.now();
  if (this.a % 30 == 0){
    console.log(newTime-this.time + " ms for 30 animation frames" );
    this.time = newTime;
}
}

function start() {
  // fork getUserMedia for multiple browser versions, for those
  // that need prefixes
  navigator.getUserMedia =
    navigator.getUserMedia ||
    navigator.webkitGetUserMedia ||
    navigator.mozGetUserMedia ||
    navigator.msGetUserMedia;

  // set up forked web audio context, for multiple browsers
  // window. is needed otherwise Safari explodes
  // Move to click event handler, because the AudioContext is not allowed to start until a user gesture on the page.

  var audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  var voiceSelect = document.getElementById("voice");
  var source;
  var stream;

  var pseudoLog = document.querySelector(".peaks");
  var maxes = document.querySelector(".maxes");
  var maxesData = {};
  // grab the mute button to use below

  var mute = document.querySelector(".mute");
  var reset = document.querySelector(".reset");

  //set up the different audio nodes we will use for the app

  var analyser = audioCtx.createAnalyser();
  analyser.minDecibels = -90;
  analyser.maxDecibels = -10;
  analyser.smoothingTimeConstant = 0.1;

  var distortion = audioCtx.createWaveShaper();
  var gainNode = audioCtx.createGain();
  var biquadFilter = audioCtx.createBiquadFilter();
  var convolver = audioCtx.createConvolver();

  // distortion curve for the waveshaper, thanks to Kevin Ennis
  // http://stackoverflow.com/questions/22312841/waveshaper-node-in-webaudio-how-to-emulate-distortion

  function makeDistortionCurve(amount) {
    var k = typeof amount === "number" ? amount : 50,
      n_samples = 44100,
      curve = new Float32Array(n_samples),
      deg = Math.PI / 180,
      i = 0,
      x;
    for (; i < n_samples; ++i) {
      x = (i * 2) / n_samples - 1;
      curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
    }
    return curve;
  }

  // grab audio track via XHR for convolver node

  var soundSource, concertHallBuffer;

  ajaxRequest = new XMLHttpRequest();

  ajaxRequest.open(
    "GET",
    "https://mdn.github.io/voice-change-o-matic/audio/concert-crowd.ogg",
    true
  );

  ajaxRequest.responseType = "arraybuffer";

  ajaxRequest.onload = function () {
    var audioData = ajaxRequest.response;

    audioCtx.decodeAudioData(
      audioData,
      function (buffer) {
        console.log("bufer sample rate: " + buffer.sampleRate);
        concertHallBuffer = buffer;
        soundSource = audioCtx.createBufferSource();
        soundSource.buffer = concertHallBuffer;
      },
      function (e) {
        console.log("Error with decoding audio data" + e.err);
      }
    );
  };

  ajaxRequest.send();

  // set up canvas context for visualizer

  var canvas = document.querySelector(".visualizer");
  var canvasCtx = canvas.getContext("2d");

  var myCanvas = document.querySelector(".mystuff");
  var myOutputCtx = myCanvas.getContext("2d");

  var maxCanvas = document.querySelector(".maxCanvas");
  var maxCtx = maxCanvas.getContext("2d");


  var intendedWidth = document.querySelector(".wrapper").clientWidth;

  canvas.setAttribute("width", intendedWidth);

  var visualSelect = document.getElementById("visual");

  var drawVisual;

  //main block for doing the audio recording

  if (navigator.getUserMedia) {
    console.log("getUserMedia supported.");
    navigator.getUserMedia(
      // constraints - only audio needed for this app
      {
        audio: true,
      },

      // Success callback
      function (stream) {
        source = audioCtx.createMediaStreamSource(stream);
        source.connect(analyser);
        analyser.connect(distortion);
        distortion.connect(biquadFilter);
        biquadFilter.connect(convolver);
        convolver.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        visualize();
        voiceChange();
      },

      // Error callback
      function (err) {
        console.log("The following gUM error occured: " + err);
      }
    );
  } else {
    console.log("getUserMedia not supported on your browser!");
  }

  function visualize() {
    let WIDTH = canvas.width;
    let HEIGHT = canvas.height;

    var visualSetting = visualSelect.value;
    console.log(visualSetting);

    if (visualSetting == "sinewave") {
      analyser.fftSize = 1024;
      var bufferLength = analyser.fftSize;
      console.log(bufferLength);
      var dataArray = new Float32Array(bufferLength);

      canvasCtx.clearRect(0, 0, WIDTH, HEIGHT);

      function draw() {
        drawVisual = requestAnimationFrame(draw);

        analyser.getFloatTimeDomainData(dataArray);

        canvasCtx.fillStyle = "rgb(200, 200, 200)";
        canvasCtx.fillRect(0, 0, WIDTH, HEIGHT);

        canvasCtx.lineWidth = 2;
        canvasCtx.strokeStyle = "rgb(0, 0, 0)";

        canvasCtx.beginPath();

        let sliceWidth = (WIDTH * 1.0) / bufferLength;
        let x = 0;

        for (let i = 0; i < bufferLength; i++) {
          let v = dataArray[i] * 200.0;
          let y = HEIGHT / 2 + v;

          if (i === 0) {
            canvasCtx.moveTo(x, y);
          } else {
            canvasCtx.lineTo(x, y);
          }

          x += sliceWidth;
        }

        canvasCtx.lineTo(canvas.width, canvas.height / 2);
        canvasCtx.stroke();
      }
      myTimer.tick();
      draw();
    } else if (visualSetting == "frequencybars") {
      analyser.fftSize = 1024; //first tries with 4096, 16384; max is 32768
      let bufferLength = analyser.frequencyBinCount;
      console.log(bufferLength);
      let dataArray = new Float32Array(bufferLength);

      canvasCtx.clearRect(0, 0, WIDTH, HEIGHT);

      function draw() {
        myTimer.tick();
        drawVisual = requestAnimationFrame(draw);

        analyser.getFloatFrequencyData(dataArray);

        canvasCtx.fillStyle = "rgb(0, 0, 0)";
        canvasCtx.fillRect(0, 0, WIDTH, HEIGHT);

        myOutputCtx.fillStyle = "rgb(0, 0, 0)";
        myOutputCtx.fillRect(0, 0, WIDTH, HEIGHT);

        let barWidth = (WIDTH / bufferLength) * 2.5;
        let barHeight;
        let x = 0;

        let peaks=[];

        for (let i = 0; i < bufferLength; i++) {
          barHeight = (dataArray[i] + 140) * 2;

          canvasCtx.fillStyle =
            "rgb(" + Math.floor(barHeight + 100) + ",50,50)";
          canvasCtx.fillRect(
            x,
            HEIGHT - barHeight / 2,
            barWidth,
            barHeight / 2
          );

          x += barWidth + 1;

          if ( i>2 && i< bufferLength-2){
            if (dataArray[i]> dataArray[i-1] && 
                dataArray[i]> dataArray[i-2] + 5 && 
                dataArray[i]> dataArray[i+1] && 
                dataArray[i]> dataArray[i+2] + 5 ){
             
              peaks.push([i, dataArray[i]]);
              if (dataArray[i]> -70 ){
                addToMax(i, dataArray, maxesData)
              }
              if (i==75){
              console.log("peaks",  x,
              HEIGHT - barHeight / 2,
              barWidth,
              barHeight / 2);}

             myOutputCtx.fillStyle =
            "rgb(" + Math.floor(barHeight + 100) + ",50,50)";
              myOutputCtx.fillRect(
                x,
                HEIGHT - barHeight / 2,
                barWidth,
                barHeight / 2
              );
            }
          }
        }

         maxCtx.fillStyle = "rgb(0, 0, 0)";
         maxCtx.fillRect(0, 0, WIDTH, HEIGHT);
         maxCtx.fillStyle = "rgb(200, 200, 200)";
        for(let peak in maxesData){
          ///maxes to obiekt, nie fcuk array
          //console.log(JSON.stringify(peak), JSON.stringify(maxesData[peak]));
          if (peak==75){
          console.log( "maxes",
            peak*(barWidth + 1),
            HEIGHT - (maxesData[peak] + 140),
            barWidth,
            (maxesData[peak] + 140))}
            maxCtx.fillStyle = "rgb(200, 50, 200)";

            maxCtx.fillRect(
            peak*(barWidth + 1),
            HEIGHT - (maxesData[peak] + 140),
            barWidth,
            (maxesData[peak] + 140))
        }


        if (mute.id == ""){
          pseudoLog.innerHTML=JSON.stringify(peaks);
          maxes.innerHTML=prettryfy(maxesData);
        }
      }
      
      draw();
    } else if (visualSetting == "off") {
      canvasCtx.clearRect(0, 0, WIDTH, HEIGHT);
      canvasCtx.fillStyle = "red";
      canvasCtx.fillRect(0, 0, WIDTH, HEIGHT);
    }
  }

  function prettryfy( o){
    let result = "";
      for (let val in o){
        result += val + ": " + o[val] + "<br>";
      }
      return result;
  }
 
  function addToMax(i, dataArray, maxesData) {
    if (!maxesData[i])
      maxesData[i] = dataArray[i];
    else if (maxesData[i] < dataArray[i]) {
      maxesData[i] = dataArray[i];
    }
  } 

  
    

  function voiceChange() {
    distortion.curve = new Float32Array(analyser.fftSize);
    distortion.oversample = "4x";
    biquadFilter.gain.value = 0;
    convolver.buffer = undefined;

    let voiceSetting = voiceSelect.value;
    console.log(voiceSetting);

    if (voiceSetting == "distortion") {
      distortion.curve = makeDistortionCurve(400);
    } else if (voiceSetting == "convolver") {
      convolver.buffer = concertHallBuffer;
    } else if (voiceSetting == "biquad") {
      biquadFilter.type = "lowshelf";
      biquadFilter.frequency.value = 1000;
      biquadFilter.gain.value = 25;
    } else if (voiceSetting == "off") {
      console.log("Voice settings turned off");
    }
  }

  // event listeners to change visualize and voice settings

  visualSelect.onchange = function () {
    window.cancelAnimationFrame(drawVisual);
    visualize();
  };

  voiceSelect.onchange = function () {
    voiceChange();
  };

  mute.onclick = voiceMute;
  reset.onclick = function () {
    maxesData = {};
  }

  function voiceMute() {
    if (mute.id == "") {
      gainNode.gain.value = 0;
      mute.id = "activated";
      mute.innerHTML = "Unmute";
    } else {
      gainNode.gain.value = 1;
      mute.id = "";
      mute.innerHTML = "Mute";
    }
  }
}
