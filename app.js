let cameraActive = false;
let videoStream = null;

document.getElementById("uploadForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const imageInput = document.getElementById("imageInput");
  const file = imageInput.files[0];

  if (!file) {
    alert("Por favor, selecciona una imagen.");
    return;
  }

  processImage(file);
});

async function toggleCamera() {
  const video = document.getElementById("video");
  const canvasContainer = document.getElementById("canvasContainer");
  const toggleButton = document.getElementById("toggleCamera");
  const canvas = document.getElementById("captureCanvas");
  const ctx = canvas.getContext("2d");

  if (cameraActive) {
    if (videoStream) {
      const tracks = videoStream.getTracks();
      tracks.forEach((track) => track.stop());
    }
    video.srcObject = null;
    videoStream = null;
    cameraActive = false;
    canvasContainer.style.display = "none";
    toggleButton.textContent = "Activar Cámara";
  } else {
    try {
      videoStream = await navigator.mediaDevices.getUserMedia({ video: true });
      video.srcObject = videoStream;

      await new Promise((resolve) => {
        video.onloadedmetadata = () => {
          video.play();
          resolve();
        };
      });

      // Limpiar el canvas antes de capturar una nueva imagen
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      cameraActive = true;
      canvasContainer.style.display = "block";
      toggleButton.textContent = "Desactivar Cámara";
    } catch (error) {
      console.error("Error al acceder a la cámara:", error);
      alert("No se pudo acceder a la cámara. Verifica los permisos.");
    }
  }
}


function captureImage() {
  const video = document.getElementById("video");
  const canvas = document.getElementById("captureCanvas");
  const ctx = canvas.getContext("2d");

  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;

  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  const capturedImage = document.getElementById("capturedImage");
  capturedImage.src = canvas.toDataURL();
  capturedImage.style.display = "block";

  document.getElementById("canvasContainer").style.display = "none";
  document.getElementById("captureOptions").style.display = "block";
}

function acceptImage() {
  const capturedImage = document.getElementById("capturedImage");

  fetch(capturedImage.src)
    .then((res) => res.blob())
    .then((blob) => {
      processImage(blob);
    });

  resetCaptureState();

  // Limpia visualmente el canvas (imagen previa)
  const canvas = document.getElementById("captureCanvas");
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  toggleCamera(); // Desactiva la cámara después de aceptar
}

function cancelImage() {
  const capturedImage = document.getElementById("capturedImage");

  capturedImage.src = "";
  capturedImage.style.display = "none";

  document.getElementById("captureOptions").style.display = "none";
  document.getElementById("canvasContainer").style.display = "block";

  const canvas = document.getElementById("captureCanvas");
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

function resetCaptureState() {
  const capturedImage = document.getElementById("capturedImage");
  capturedImage.src = "";
  capturedImage.style.display = "none";

  document.getElementById("captureOptions").style.display = "none";
}

async function processImage(file) {
  const resizedImage = await resizeImage(file, 1024, 1024);

  const resultDiv = document.getElementById("result");
  resultDiv.textContent = "Procesando...";

  const reader = new FileReader();
  reader.onload = async (event) => {
    const imageData = event.target.result;

    try {
      const result = await Tesseract.recognize(imageData, "spa", {
        logger: (m) => {
          if (m.status === "recognizing text") {
            resultDiv.textContent = `Reconociendo texto: ${Math.round(
              m.progress * 100
            )}%`;
          }
        },
      });

      const extractedText = result.data.text;
      resultDiv.textContent = `Texto extraído:\n${extractedText}`;

      // Mostrar texto completo en el preview editable
      const previewArea = document.getElementById("editableData");
      previewArea.value = extractedText;

      // Detectar si los datos parecen ser de una factura
      const invoiceData = detectInvoiceData(extractedText);
      if (invoiceData) {
        alert(
          "Se detectaron datos de factura. Puedes editar y descargar el CSV."
        );
        showInvoicePreview();
      } else {
        alert("El texto no contiene datos de factura.");
      }
    } catch (error) {
      resultDiv.textContent = "Error al procesar la imagen con Tesseract.";
      console.error(error);
    }

    resetCaptureState();
  };

  reader.readAsDataURL(resizedImage);
}


function detectInvoiceData(text) {
  const keywords = ["base", "impuesto", "subtotal", "total", "iva", "neto"];
  const lines = text.split("\n");
  const invoiceData = [];

  const currencySymbolsRegex = /(\s)?(US\$|\$|€|¥|₡|₱|₹)/gi;

  for (const line of lines) {
    const cleanLine = line.trim().toLowerCase();

    for (const keyword of keywords) {
      if (cleanLine.includes(keyword)) {
        // Buscar número en la línea (con o sin símbolo de moneda)
        const match = line.match(/([A-Z$€¥₡₱₹]*\s*)?(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?)/);

        if (match) {
          const label = keyword;
          let amount = match[2];

          // Limpiar separadores de miles y convertir decimales
          amount = amount.replace(/\./g, "").replace(",", ".");
          amount = amount.replace(currencySymbolsRegex, "").trim();

          invoiceData.push(`${capitalize(label)},${amount}`);
          break;
        }
      }
    }
  }

  // Si se detectaron datos válidos, mostrarlos en el preview editable
  if (invoiceData.length > 0) {
    const previewArea = document.getElementById("editableData");
    previewArea.value = "Nombre,Monto\n" + invoiceData.join("\n");
    return invoiceData;
  }

  return null;
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function showInvoicePreview() {
  const invoicePreview = document.getElementById("invoicePreview");
  const downloadButton = document.getElementById("downloadCSVButton");

  invoicePreview.style.display = "block";
  downloadButton.style.display = "inline-block";

  downloadButton.addEventListener("click", () => {
    const previewArea = document.getElementById("editableData");
    const csvContent = "data:text/csv;charset=utf-8," + previewArea.value;
    const encodedUri = encodeURI(csvContent);

    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "factura.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  });
}

function resizeImage(file, maxWidth, maxHeight) {
  return new Promise((resolve) => {
    const img = new Image();
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const reader = new FileReader();

    reader.onload = (event) => {
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > maxWidth || height > maxHeight) {
          if (width > height) {
            height *= maxWidth / width;
            width = maxWidth;
          } else {
            width *= maxHeight / height;
            height = maxHeight;
          }
        }

        canvas.width = width;
        canvas.height = height;
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob((blob) => resolve(blob), file.type, 0.8);
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("toggleCamera").addEventListener("click", toggleCamera);
  document.getElementById("captureButton").addEventListener("click", captureImage);
  document.getElementById("acceptButton").addEventListener("click", acceptImage);
  document.getElementById("cancelButton").addEventListener("click", cancelImage);
});
