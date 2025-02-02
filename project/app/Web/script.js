const uploadButton = document.getElementById('upload-button');
const audioFileInput = document.getElementById('audio-file');
const recordButton = document.getElementById('recordButton');
const stopButton = document.getElementById('stopButton');
const pauseButton = document.getElementById('pauseButton');
const responseDiv = document.getElementById('response');

let gumStream; // Stream from getUserMedia()
let rec; // Recorder.js object
let input; // MediaStreamAudioSourceNode

let audioContext; // Déclarer audioContext en dehors de la fonction pour qu'il soit accessible globalement

// Fonction pour initialiser ou reprendre l'AudioContext
function startAudioContext() {
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  } else if (audioContext.state === 'suspended') {
    audioContext.resume().then(() => {
      console.log('AudioContext repris');
    });
  }
}

// Function to create a download link
function createDownloadLink(blob, filename = 'audio.wav') {
  const audioUrl = URL.createObjectURL(blob);
  const downloadLink = document.createElement('a');
  downloadLink.href = audioUrl;
  downloadLink.download = filename;
  downloadLink.textContent = `Download ${filename}`;
  downloadLink.style.display = 'block';
  return downloadLink;
}

// Fonction pour rééchantillonner l'audio à 16 kHz
async function resampleAudio(blob, targetSampleRate = 16000) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async () => {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const buffer = await audioContext.decodeAudioData(reader.result);

      // Créer un nouvel AudioContext avec le taux d'échantillonnage cible
      const offlineContext = new OfflineAudioContext(
        buffer.numberOfChannels,
        buffer.length * (targetSampleRate / buffer.sampleRate),
        targetSampleRate
      );

      // Créer une source audio avec le buffer original
      const source = offlineContext.createBufferSource();
      source.buffer = buffer;

      // Connecter la source au contexte offline
      source.connect(offlineContext.destination);
      source.start();

      // Rendre l'audio
      const resampledBuffer = await offlineContext.startRendering();

      // Convertir le buffer rééchantillonné en WAV
      const wavBlob = bufferToWav(resampledBuffer);
      resolve(wavBlob);
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(blob);
  });
}

// Fonction pour convertir un AudioBuffer en WAV
function bufferToWav(buffer) {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const length = buffer.length * numChannels * 2; // 2 bytes par échantillon
  const data = new Float32Array(length);

  // Interleave les canaux
  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < channelData.length; i++) {
      data[i * numChannels + channel] = channelData[i];
    }
  }

  // Encoder en WAV
  const wavBlob = encodeWAV(data, sampleRate, numChannels);
  return wavBlob;
}

// Fonction pour encoder des données audio en WAV
function encodeWAV(samples, sampleRate, numChannels) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  // Écrire l'en-tête WAV
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // Format PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * 2, true);
  view.setUint16(32, numChannels * 2, true);
  view.setUint16(34, 16, true); // Bits par échantillon
  writeString(view, 36, 'data');
  view.setUint32(40, samples.length * 2, true);

  // Écrire les échantillons audio
  floatTo16BitPCM(view, 44, samples);

  return new Blob([view], { type: 'audio/wav' });
}

// Fonction utilitaire pour écrire une chaîne dans un DataView
function writeString(view, offset, string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

// Fonction utilitaire pour convertir des échantillons flottants en PCM 16 bits
function floatTo16BitPCM(view, offset, input) {
  for (let i = 0; i < input.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, input[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }
}

async function uploadAudio(files) {
  if (!files || files.length === 0) {
      alert('Please select or record files first!');
      return;
  }

  const formData = new FormData();
  if (files.length === 1) {
      // Si un seul fichier est sélectionné
      formData.append('files', files[0]); // Utiliser 'files' comme nom de champ
  } else {
      // Si plusieurs fichiers sont sélectionnés
      for (let i = 0; i < files.length; i++) {
          formData.append('files', files[i]); // Utiliser 'files' comme nom de champ
      }
  }

  responseDiv.textContent = 'Uploading and analyzing audio...';

  try {
      const response = await fetch('http://127.0.0.1:8000/predict/', {
          method: 'POST',
          body: formData,
      });
      
      if (!response.ok) {
          const errorData = await response.json();
          throw new Error(`Server error: ${errorData.message || response.statusText}`);
      }

      const data = await response.json();
      responseDiv.innerHTML = ''; // Clear previous responses

      data.forEach((result, index) => {
          const resultDiv = document.createElement('div');
          resultDiv.innerHTML = `File: <b>${result.filename}</b>, Label: <b>${result.label}</b>, Confidence: <b>${result.confidence}</b>`;
          responseDiv.appendChild(resultDiv);

          // Add download link for the uploaded file
          const downloadLink = createDownloadLink(files[index], `uploaded-audio-${index}.wav`);
          responseDiv.appendChild(downloadLink);
      });
  } catch (error) {
      console.error('Error:', error);
      responseDiv.textContent = 'Error: ' + error.message;
  }
}

uploadButton.addEventListener('click', () => {
  const files = audioFileInput.files;
  if (!files || files.length === 0) {
      alert('Please select files first!');
      return;
  }
  uploadAudio(files);
});

// Start Recording
recordButton.addEventListener('click', async () => {
  startAudioContext(); // Initialiser ou reprendre l'AudioContext

  console.log('Recording started');

  const constraints = { audio: true, video: false };

  try {
    gumStream = await navigator.mediaDevices.getUserMedia(constraints);
    console.log('Microphone access granted');
    input = audioContext.createMediaStreamSource(gumStream);
    console.log('Audio source created');

    // Initialize Recorder.js
    rec = new Recorder(input, { numChannels: 1 });
    console.log('Recorder initialized');

    // Start recording
    rec.record();
    console.log('Recording started');

    // Update button states
    recordButton.disabled = true;
    stopButton.disabled = false;
    pauseButton.disabled = false;
  } catch (error) {
    console.error('Error accessing microphone:', error);
    alert('Error accessing microphone: ' + error.message);
  }
});

function stopRecording() {
  console.log('stopRecording called');

  // Désactiver les boutons
  stopButton.disabled = true;
  recordButton.disabled = false;
  pauseButton.disabled = true;
  pauseButton.innerHTML = 'Pause';

  // Arrêter l'enregistrement
  rec.stop();
  console.log('Recording stopped');

  // Arrêter l'accès au microphone
  gumStream.getAudioTracks()[0].stop();
  console.log('Microphone access stopped');

  // Exporter l'audio en WAV
  rec.exportWAV(async (blob) => {
    console.log('Audio exported as WAV');

    // Vérifier la taille du fichier audio
    if (blob.size === 0) {
      console.error('Le fichier audio est vide.');
      responseDiv.textContent = 'Erreur : Le fichier audio est vide.';
      return;
    }

    // Rééchantillonner l'audio à 16 kHz
    try {
      const resampledBlob = await resampleAudio(blob, 16000);
      console.log('Audio rééchantillonné à 16 kHz');

      // Créer un lien de téléchargement
      const downloadLink = createDownloadLink(resampledBlob, 'recorded-audio.wav');
      responseDiv.innerHTML = ''; // Effacer les réponses précédentes
      responseDiv.appendChild(downloadLink);

      // Envoyer l'audio rééchantillonné à l'API pour analyse
      await sendAudioToAPI(resampledBlob); // Ajouter await ici
    } catch (error) {
      console.error('Erreur lors du rééchantillonnage :', error);
      responseDiv.textContent = 'Erreur : ' + error.message;
    }
  });
}

async function sendAudioToAPI(blob) {
  console.log('Sending audio to API');

  const formData = new FormData();
  const filename = 'recorded-audio.wav'; // Nom du fichier
  formData.append('files', blob, filename); // Utiliser 'files' comme nom de champ

  try {
      const response = await fetch('http://127.0.0.1:8000/predict/', {
          method: 'POST',
          body: formData,
      });

      console.log('API response status:', response.status);

      if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      console.log('API response data:', data);

      // Afficher le résultat de l'API
      if (data.length > 0) {
          responseDiv.innerHTML = `Label: <b>${data[0].label}</b>, Confidence: <b>${data[0].confidence}</b>`;
      } else {
          responseDiv.textContent = 'Error: No data returned from the API.';
      }
  } catch (error) {
      console.error('Error sending audio to API:', error);
      responseDiv.textContent = 'Error: ' + error.message;
  }
}

// Pause Recording
pauseButton.addEventListener('click', () => {
  if (rec.recording) {
    // Pause recording
    rec.stop();
    pauseButton.textContent = 'Resume';
  } else {
    // Resume recording
    rec.record();
    pauseButton.textContent = 'Pause';
  }
});

stopButton.addEventListener('click', () => {
  stopRecording();
});


// Ajouter un écouteur d'événement pour un clic utilisateur sur le bouton d'enregistrement
recordButton.addEventListener('click', async () => {
  startAudioContext(); // Initialiser ou reprendre l'AudioContext

  console.log('Recording started');

  const constraints = { audio: true, video: false };

  try {
    gumStream = await navigator.mediaDevices.getUserMedia(constraints);
    console.log('Microphone access granted');
    input = audioContext.createMediaStreamSource(gumStream);
    console.log('Audio source created');

    // Initialize Recorder.js
    rec = new Recorder(input, { numChannels: 1 });
    console.log('Recorder initialized');

    // Start recording
    rec.record();
    console.log('Recording started');

    // Update button states
    recordButton.disabled = true;
    stopButton.disabled = false;
    pauseButton.disabled = false;
  } catch (error) {
    console.error('Error accessing microphone:', error);
    alert('Error accessing microphone: ' + error.message);
  }
});
