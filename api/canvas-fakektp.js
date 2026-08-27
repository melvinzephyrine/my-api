const fs = require("fs");
const path = require("path");
const stream = require("stream");
const PImage = require("pureimage");

const FONT_SIZE = { LABEL: 25, PHOTO: 32, FIELD: 16, SIGN: 40 };
const PHOTO_BOX = { x: 530, y: 140, w: 174, h: 188 };

const ASSET_DIR = path.join(process.cwd(), "src", "assets");
const PATH_ARRIAL = path.join(ASSET_DIR, "Arrial.ttf");
const PATH_SIGN = path.join(ASSET_DIR, "tandatangan.ttf");
const PATH_OCR = path.join(ASSET_DIR, "styleHuruf.ttf");
const PATH_TEMPLATE = path.join(ASSET_DIR, "Template.png");

let fontsRegistered = false;

async function registerFonts() {
  if (fontsRegistered) return;

  await Promise.all([
    PImage.registerFont(PATH_ARRIAL, "Arrial").load(),
    PImage.registerFont(PATH_SIGN, "Sign").load(),
    PImage.registerFont(PATH_OCR, "Ocr").load(),
  ]);

  fontsRegistered = true;
}

const up = (value) => (value || "").toUpperCase();

async function fetchImageFromUrl(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Gagal mengunduh pas_photo dari URL");
  const contentType = res.headers.get("content-type") || "";
  const arrayBuffer = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const readable = new stream.Readable();
  readable._read = () => {};
  readable.push(buffer);
  readable.push(null);

  if (contentType.includes("jpeg") || contentType.includes("jpg")) {
    return await PImage.decodeJPEGFromStream(readable);
  } else {
    return await PImage.decodePNGFromStream(readable);
  }
}

function drawFields(ctx, data) {
  ctx.fillStyle = "black";

  ctx.font = `${FONT_SIZE.LABEL}pt Arrial`;
  ctx.fillText(`PROVINSI ${up(data.provinsi)}`, 214, 45);
  ctx.fillText(`KOTA ${up(data.kota)}`, 270, 70);

  ctx.font = `${FONT_SIZE.LABEL}pt Ocr`;
  ctx.fillText(data.nik || "", 170, 123);

  ctx.font = `${FONT_SIZE.FIELD}pt Arrial`;
  ctx.fillText(up(data.nama), 190, 158);
  ctx.fillText(up(data.ttl), 190, 180);
  ctx.fillText(up(data.jenis_kelamin), 190, 200);
  ctx.fillText(up(data.golongan_darah), 463, 200);
  ctx.fillText(up(data.alamat), 190, 224);
  ctx.fillText(up(data.rt), 190, 245);
  ctx.fillText(up(data.kelurahan), 190, 267);
  ctx.fillText(up(data.kecamatan), 190, 290);
  ctx.fillText(up(data.agama), 190, 317);
  ctx.fillText(up(data.status), 190, 335);
  ctx.fillText(up(data.pekerjaan), 190, 355);
  ctx.fillText(up(data.kewarganegaraan), 190, 378);
  ctx.fillText(up(data.masa_berlaku), 190, 399);
  ctx.fillText(`KOTA ${up(data.kota)}`, 553, 354);
  ctx.fillText(data.terbuat || "", 570, 372);

  ctx.font = `${FONT_SIZE.SIGN}pt Sign`;
  const sign = data.tandatangan || (data.nama || "").split(" ")[0];
  ctx.fillText(sign, 565, 415);
}

async function generateKTP(data) {
  await registerFonts();

  const templateImg = await PImage.decodePNGFromStream(fs.createReadStream(PATH_TEMPLATE));
  const img = PImage.make(templateImg.width, templateImg.height);
  const ctx = img.getContext("2d");

  ctx.drawImage(templateImg, 0, 0);

  if (data.pas_photo) {
    try {
      const photoImg = await fetchImageFromUrl(data.pas_photo);
      ctx.drawImage(
        photoImg,
        0, 0, photoImg.width, photoImg.height,
        PHOTO_BOX.x, PHOTO_BOX.y, PHOTO_BOX.w, PHOTO_BOX.h
      );
    } catch (e) {
      console.error("Gagal memuat pas_photo:", e.message);
    }
  }

  drawFields(ctx, data);
  return img;
}

module.exports = [
  {
    name: "KTP Maker",
    desc: "Generate a fake Indonesian ID card (KTP) image from provided data and a photo URL.",
    category: "Canvas",
    parameters: {
      apikey: { type: "string", required: true },
      provinsi: { type: "string", required: false, example: "SUMATERA UTARA" },
      kota: { type: "string", required: false, example: "MEDAN" },
      nik: { type: "string", required: true, example: "1234567890" },
      nama: { type: "string", required: true, example: "MELVIN" },
      ttl: { type: "string", required: false, example: "MEDAN, 17-08-1945" },
      jenis_kelamin: { type: "string", required: false, example: "LAKI-LAKI" },
      golongan_darah: { type: "string", required: false, example: "O" },
      alamat: { type: "string", required: false, example: "JL. KANGEN NO. 1" },
      rt: { type: "string", required: false, example: "001/002" },
      kelurahan: { type: "string", required: false, example: "COBLONG" },
      kecamatan: { type: "string", required: false, example: "COBLONG" },
      agama: { type: "string", required: false, example: "ISLAM" },
      status: { type: "string", required: false, example: "KAWIN" },
      pekerjaan: { type: "string", required: false, example: "DPR" },
      kewarganegaraan: { type: "string", required: false, example: "WNI" },
      masa_berlaku: { type: "string", required: false, example: "SEUMUR HIDUP" },
      terbuat: { type: "string", required: false, example: "12-10-2020" },
      tandatangan: { type: "string", required: false, example: "Thom" },
      pas_photo: {
        type: "string",
        required: true,
        example: "https://files.catbox.moe/Foloq31.jpg",
      },
    },
    path: "/api/canvas/fakektp",
    async run(req, res) {
      const apikey = req.query.apikey || req.body?.apikey;
      const pas_photo = req.query.pas_photo || req.body?.pas_photo;
      const nama = req.query.nama || req.body?.nama;
      const nik = req.query.nik || req.body?.nik;

      if (!global.apikey.includes(apikey)) {
        return res.json({ status: false, error: "Apikey invalid" });
      }

      if (!pas_photo || !nama || !nik) {
        return res.json({
          status: false,
          error: "Parameter wajib: apikey, pas_photo, nama, dan nik",
        });
      }

      try {
        const queryData = {
          provinsi: req.query.provinsi || req.body?.provinsi || "",
          kota: req.query.kota || req.body?.kota || "",
          nik: nik,
          nama: nama,
          ttl: req.query.ttl || req.body?.ttl || "",
          jenis_kelamin: req.query.jenis_kelamin || req.body?.jenis_kelamin || "",
          golongan_darah: req.query.golongan_darah || req.body?.golongan_darah || "",
          alamat: req.query.alamat || req.body?.alamat || "",
          rt: req.query.rt || req.body?.rt || "",
          kelurahan: req.query.kelurahan || req.body?.kelurahan || "",
          kecamatan: req.query.kecamatan || req.body?.kecamatan || "",
          agama: req.query.agama || req.body?.agama || "",
          status: req.query.status || req.body?.status || "",
          pekerjaan: req.query.pekerjaan || req.body?.pekerjaan || "",
          kewarganegaraan: req.query.kewarganegaraan || req.body?.kewarganegaraan || "",
          masa_berlaku: req.query.masa_berlaku || req.body?.masa_berlaku || "SEUMUR HIDUP",
          terbuat: req.query.terbuat || req.body?.terbuat || "",
          tandatangan: req.query.tandatangan || req.body?.tandatangan || "",
          pas_photo: pas_photo,
        };

        const img = await generateKTP(queryData);

        res.writeHead(200, {
          "Content-Type": "image/jpeg",
          "Cache-Control": "public, max-age=86400",
        });

        await PImage.encodeJPEGToStream(img, res, 95);
      } catch (error) {
        if (!res.headersSent) {
          return res.json({
            status: false,
            error: error.message || "Gagal meng-generate KTP",
          });
        }
        res.end();
      }
    },
  },
];
