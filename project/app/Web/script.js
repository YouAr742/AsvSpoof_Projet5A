const uploadButton = document.getElementById('upload-button');
const audioFileInput = document.getElementById('audio-file');
const recordButton = document.getElementById('record-button');
const stopButton = document.getElementById('stop-button');
const responseDiv = document.getElementById('response');

let mediaRecorder;
let audioChunks = [];

// Function to create a download link
function createDownloadLink(file, filename = 'audio.wav') {
  const audioUrl = URL.createObjectURL(file);
  const downloadLink = document.createElement('a');
  downloadLink.href = audioUrl;
  downloadLink.download = filename;
  downloadLink.textContent = `Download ${filename}`;
  downloadLink.style.display = 'block';
  return downloadLink;
}

// Function to handle file upload
async function uploadAudio(file) {
  if (!file) {
    alert('Please select or record a file first!');
    return;
  }

  const formData = new FormData();
  formData.append('file', file);

  responseDiv.textContent = 'Uploading and analyzing audio...';

  try {
    const response = await fetch('http://127.0.0.1:8000/predict/', {
      method: 'POST',
      body: formData,
    });
    const data = await response.json();
    responseDiv.innerHTML = `Label: <b>${data.label}</b>, Confidence: <b>${data.confidence}</b>`;

    // Add download link for the uploaded file
    const downloadLink = createDownloadLink(file, 'uploaded-audio.wav');
    responseDiv.appendChild(downloadLink);
  } catch (error) {
    responseDiv.textContent = 'Error: ' + error.message;
  }
}

// File Upload Handler
uploadButton.addEventListener('click', () => {
  const file = audioFileInput.files[0];
  if (!file) {
    alert('Please select a file first!');
    return;
  }
  uploadAudio(file);
});

// Start Recording
recordButton.addEventListener('click', async () => {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    alert('Recording is not supported on this browser.');
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream);

    mediaRecorder.start();
    audioChunks = [];
    recordButton.disabled = true;
    stopButton.disabled = false;

    mediaRecorder.ondataavailable = (event) => {
      audioChunks.push(event.data);
    };

    mediaRecorder.onstop = async () => {

      const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });

      // Add download link for the recorded audio
      const downloadLink = createDownloadLink(audioBlob, 'recorded-audio.wav');
      responseDiv.innerHTML = ''; // Clear previous responses
      responseDiv.appendChild(downloadLink);

      // Upload the recorded audio
      await uploadAudio(audioBlob);
    };
  } catch (error) {
    alert('Error accessing microphone: ' + error.message);
  }
});

// Stop Recording
stopButton.addEventListener('click', () => {
  if (mediaRecorder) {
    mediaRecorder.stop();
    recordButton.disabled = false;
    stopButton.disabled = true;
  }
});
