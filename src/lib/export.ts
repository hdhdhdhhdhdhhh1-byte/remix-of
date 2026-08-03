import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";

async function createCanvas(el: HTMLElement) {
  return await html2canvas(el, {
    scale: 2,
    backgroundColor: "#ffffff",
    useCORS: true,
    allowTaint: true,
    logging: false,
    imageTimeout: 15000,
  });
}

function downloadFile(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.style.display = "none";
  a.href = url;
  a.download = filename;

  document.body.appendChild(a);
  a.click();

  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 1000);
}

export async function exportElementAsImage(
  el: HTMLElement,
  filename: string
) {
  const canvas = await createCanvas(el);

  canvas.toBlob((blob) => {
    if (!blob) return;

    downloadFile(
      blob,
      filename + ".png"
    );
  }, "image/png");
}


export async function exportElementAsPDF(
  el: HTMLElement,
  filename: string
) {
  const canvas = await createCanvas(el);

  const imgData = canvas.toDataURL("image/png");

  const pdf = new jsPDF({
    orientation: "p",
    unit: "mm",
    format: "a4",
  });

  const width = pdf.internal.pageSize.getWidth() - 20;
  const height =
    (canvas.height * width) / canvas.width;

  pdf.addImage(
    imgData,
    "PNG",
    10,
    10,
    width,
    height
  );

  pdf.save(filename + ".pdf");
}


export function printElement(el: HTMLElement) {
  const w = window.open("", "_blank");

  if (!w) return;

  w.document.write(`
  <html dir="rtl">
  <body>
  ${el.innerHTML}
  </body>
  </html>
  `);

  w.document.close();

  setTimeout(() => {
    w.print();
  }, 500);
}


export async function shareElementAsImage(
  el: HTMLElement,
  filename: string,
  title: string
) {
  const canvas = await createCanvas(el);

  const blob = await new Promise<Blob | null>(
    (resolve) =>
      canvas.toBlob(resolve, "image/png")
  );

  if (!blob) return;

  const file = new File(
    [blob],
    filename + ".png",
    {
      type: "image/png",
    }
  );


  if (
    navigator.share &&
    navigator.canShare &&
    navigator.canShare({
      files: [file],
    })
  ) {

    await navigator.share({
      files: [file],
      title,
    });

  } else {

    downloadFile(
      blob,
      filename + ".png"
    );

  }
}
