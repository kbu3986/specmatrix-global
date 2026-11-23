/**
 * SpecMatrix Global — Zero-Dependency Crisp 1200x630 PNG OG Social Card Generator
 * Uses Node built-in zlib (deflateSync) + deterministic pixel-art engineering typography.
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, "..", "public", "og");

const WIDTH = 1200;
const HEIGHT = 630;

// 5x7 crisp bitmap font (uppercase A-Z, 0-9, punctuation)
const FONT_5X7 = {
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  C: ["01110", "10001", "10000", "10000", "10000", "10001", "01110"],
  D: ["11100", "10010", "10001", "10001", "10001", "10010", "11100"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  G: ["01110", "10001", "10000", "10111", "10001", "10001", "01110"],
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  I: ["01110", "00100", "00100", "00100", "00100", "00100", "01110"],
  J: ["00111", "00010", "00010", "00010", "10010", "10010", "01100"],
  K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  Q: ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  W: ["10001", "10001", "10001", "10101", "10101", "11011", "10001"],
  X: ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
  Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
  Z: ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
  "0": ["01110", "10011", "10101", "10101", "11001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00110", "01000", "10000", "11111"],
  "3": ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
  "6": ["01110", "10000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00001", "01110"],
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
  ".": ["00000", "00000", "00000", "00000", "00000", "01100", "01100"],
  "-": ["00000", "00000", "00000", "11111", "00000", "00000", "00000"],
  "/": ["00001", "00010", "00010", "00100", "01000", "01000", "10000"],
  ":": ["00000", "00100", "00100", "00000", "00100", "00100", "00000"],
  "+": ["00000", "00100", "00100", "11111", "00100", "00100", "00000"],
  "&": ["01100", "10010", "10100", "01000", "10101", "10010", "01101"],
  "|": ["00100", "00100", "00100", "00100", "00100", "00100", "00100"],
  "%": ["11001", "11010", "00010", "00100", "01000", "01011", "10011"],
};

// Precomputed CRC32 lookup table
const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  CRC_TABLE[n] = c >>> 0;
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcInput = Buffer.concat([typeBuf, data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function encodePngRgb(width, height, rgb) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: Truecolor RGB
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const stride = width * 3;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (stride + 1);
    raw[rowStart] = 0; // filter type None
    rgb.copy(raw, rowStart + 1, y * stride, (y + 1) * stride);
  }

  const compressed = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    signature,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", compressed),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function createCanvas(w, h) {
  const rgb = Buffer.alloc(w * h * 3);

  function setPixel(x, y, r, g, b, alpha = 1) {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const idx = (y * w + x) * 3;
    if (alpha >= 1) {
      rgb[idx] = r;
      rgb[idx + 1] = g;
      rgb[idx + 2] = b;
    } else {
      const inv = 1 - alpha;
      rgb[idx] = Math.round(r * alpha + rgb[idx] * inv);
      rgb[idx + 1] = Math.round(g * alpha + rgb[idx + 1] * inv);
      rgb[idx + 2] = Math.round(b * alpha + rgb[idx + 2] * inv);
    }
  }

  function fillRect(x, y, rw, rh, col, alpha = 1) {
    const x0 = Math.max(0, Math.floor(x));
    const y0 = Math.max(0, Math.floor(y));
    const x1 = Math.min(w, Math.floor(x + rw));
    const y1 = Math.min(h, Math.floor(y + rh));
    for (let py = y0; py < y1; py++) {
      for (let px = x0; px < x1; px++) {
        setPixel(px, py, col[0], col[1], col[2], alpha);
      }
    }
  }

  function fillRoundedRect(x, y, rw, rh, radius, col, alpha = 1) {
    const r = Math.min(radius, rw / 2, rh / 2);
    const x0 = Math.max(0, Math.floor(x));
    const y0 = Math.max(0, Math.floor(y));
    const x1 = Math.min(w, Math.floor(x + rw));
    const y1 = Math.min(h, Math.floor(y + rh));
    for (let py = y0; py < y1; py++) {
      for (let px = x0; px < x1; px++) {
        const dx = px < x + r ? x + r - px : px >= x + rw - r ? px - (x + rw - r - 1) : 0;
        const dy = py < y + r ? y + r - py : py >= y + rh - r ? py - (y + rh - r - 1) : 0;
        if (dx * dx + dy * dy <= r * r) {
          setPixel(px, py, col[0], col[1], col[2], alpha);
        }
      }
    }
  }

  function strokeRect(x, y, rw, rh, thickness, col, alpha = 1) {
    fillRect(x, y, rw, thickness, col, alpha);
    fillRect(x, y + rh - thickness, rw, thickness, col, alpha);
    fillRect(x, y, thickness, rh, col, alpha);
    fillRect(x + rw - thickness, y, thickness, rh, col, alpha);
  }

  function drawText(text, x, y, scale, col, letterSpacing = 1) {
    const upper = String(text || "").toUpperCase();
    let cx = x;
    for (let i = 0; i < upper.length; i++) {
      const ch = upper[i];
      const glyph = FONT_5X7[ch] || FONT_5X7[" "];
      for (let row = 0; row < 7; row++) {
        const line = glyph[row];
        for (let colIdx = 0; colIdx < 5; colIdx++) {
          if (line[colIdx] === "1") {
            fillRect(cx + colIdx * scale, y + row * scale, scale, scale, col, 1);
          }
        }
      }
      cx += (5 + letterSpacing) * scale;
    }
  }

  return { rgb, setPixel, fillRect, fillRoundedRect, strokeRect, drawText };
}

const CARDS = [
  {
    file: "og-default.png",
    accent: [59, 130, 246], // Cobalt
    accentSoft: [30, 58, 138],
    badge: "EVIDENCE-ANCHORED SPEC LAB",
    title1: "SPECMATRIX",
    title2: "GLOBAL",
    subtitle: "72 SKUS | 30 AIRLINES | 31 VS | LIVE TOOLS",
    pills: ["WATTCHECK", "PUREGRAM", "CYCLEGEAR", "HOMETECH"],
  },
  {
    file: "og-wattcheck.png",
    accent: [59, 130, 246], // Blue
    accentSoft: [30, 64, 175],
    badge: "WATTCHECK POWER MATRIX",
    title1: "POWER BANKS",
    title2: "& GAN CHARGERS",
    subtitle: "USB-PD PORT SPLIT | REAL USABLE WH | 30 AIRLINES",
    pills: ["IATA 100WH", "MOLIT 2026", "PD 3.1 EPR", "KC / PSE"],
  },
  {
    file: "og-puregram.png",
    accent: [16, 185, 129], // Emerald
    accentSoft: [6, 95, 70],
    badge: "PUREGRAM NUTRITION MATRIX",
    title1: "PURE ACTIVE",
    title2: "GRAM COST LAB",
    subtitle: "ENERGY GELS | ELECTROLYTES | CREATINE PURITY",
    pills: ["1:0.8 CARB", "90G/HR COST", "SODIUM MG", "CLEAN LABEL"],
  },
  {
    file: "og-cyclegear.png",
    accent: [245, 158, 11], // Amber
    accentSoft: [146, 64, 14],
    badge: "CYCLEGEAR ROAD MATRIX",
    title1: "POWER METERS",
    title2: "& HOOKLESS LAB",
    subtitle: "GPS COMPUTERS | TRAINERS | ETRTO 5.0 BAR GUARD",
    pills: ["HOOKLESS 5BAR", "BB / FREEHUB", "ANT+ / BLE", "TORQUE SPEC"],
  },
  {
    file: "og-hometech.png",
    accent: [139, 92, 246], // Violet
    accentSoft: [91, 33, 182],
    badge: "HOMETECH 3-YEAR TCO MATRIX",
    title1: "MINIPC | NAS",
    title2: "UPS & VACUUMS",
    subtitle: "24/7 IDLE DRAW | KEPCO TIERED TCO | PURE SINE",
    pills: ["3-YR TCO", "24/7 KWH", "PURE SINE", "100-240V"],
  },
];

function renderCard(card) {
  const c = createCanvas(WIDTH, HEIGHT);

  // Dark slate lab gradient background
  for (let y = 0; y < HEIGHT; y++) {
    const t = y / HEIGHT;
    const r = Math.round(11 + t * 14);
    const g = Math.round(18 + t * 16);
    const b = Math.round(33 + t * 24);
    for (let x = 0; x < WIDTH; x++) {
      c.setPixel(x, y, r, g, b, 1);
    }
  }

  // Subtle ambient accent glow in top-right corner
  const glowCx = WIDTH - 140;
  const glowCy = 110;
  for (let y = 0; y < 380; y++) {
    for (let x = WIDTH - 480; x < WIDTH; x++) {
      const dx = x - glowCx;
      const dy = y - glowCy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 340) {
        const a = Math.pow(1 - dist / 340, 2) * 0.22;
        c.setPixel(x, y, card.accent[0], card.accent[1], card.accent[2], a);
      }
    }
  }

  // Blueprint engineering grid lines (every 40px)
  for (let x = 40; x < WIDTH; x += 40) {
    c.fillRect(x, 0, 1, HEIGHT, [148, 163, 184], 0.08);
  }
  for (let y = 40; y < HEIGHT; y += 40) {
    c.fillRect(0, y, WIDTH, 1, [148, 163, 184], 0.08);
  }

  // Left vertical accent rail
  c.fillRect(0, 0, 18, HEIGHT, card.accent, 1);

  // Subtle frame border
  c.strokeRect(48, 42, WIDTH - 96, HEIGHT - 84, 2, [51, 65, 85], 0.85);

  // Top-left SM Monogram Badge
  c.fillRoundedRect(82, 74, 72, 72, 14, card.accent, 1);
  c.drawText("SM", 94, 93, 4, [255, 255, 255], 1);

  // Brand name beside badge
  c.drawText("SPECMATRIX GLOBAL", 174, 86, 3, [241, 245, 249], 1);
  c.drawText("VERIFIED ENGINEERING SPEC LAB", 174, 120, 2, [148, 163, 184], 1);

  // Right-side decorative telemetry matrix graphic (6 bars)
  const bars = [0.88, 0.64, 0.96, 0.72, 0.54, 0.82];
  for (let i = 0; i < bars.length; i++) {
    const bx = 945 + i * 28;
    const bh = Math.round(bars[i] * 74);
    c.fillRoundedRect(bx, 150 - bh, 18, bh, 4, i % 2 === 0 ? card.accent : [100, 116, 139], 0.85);
  }

  // Category pill badge (crisp rounded border via inset fill)
  const badgeW = Math.min(720, card.badge.length * 12 + 44);
  c.fillRoundedRect(82, 182, badgeW, 40, 20, card.accent, 0.9);
  c.fillRoundedRect(84, 184, badgeW - 4, 36, 18, card.accentSoft, 0.96);
  c.drawText(card.badge, 104, 195, 2, [248, 250, 252], 1);

  // Bold 2-line hero headline
  c.drawText(card.title1, 82, 254, 8, [255, 255, 255], 1);
  c.drawText(card.title2, 82, 332, 8, card.accent, 1);

  // Subtitle line
  c.drawText(card.subtitle, 82, 418, 3, [203, 213, 225], 1);

  // Horizontal divider
  c.fillRect(82, 466, WIDTH - 164, 2, [51, 65, 85], 0.9);

  // 4 Engineering Feature Pills (clean rounded outline via inset fill)
  let px = 82;
  for (let i = 0; i < card.pills.length; i++) {
    const label = card.pills[i];
    const pw = label.length * 12 + 34;
    c.fillRoundedRect(px, 492, pw, 36, 8, card.accent, 0.55);
    c.fillRoundedRect(px + 1, 493, pw - 2, 34, 7, [24, 35, 53], 1);
    c.drawText(label, px + 17, 503, 2, [226, 232, 240], 1);
    px += pw + 14;
  }

  // Bottom bar footer text
  c.drawText("EN / KO BILINGUAL", 82, 554, 2, [148, 163, 184], 1);
  c.drawText("SPECMATRIX.IO", WIDTH - 260, 554, 2, card.accent, 1);

  return encodePngRgb(WIDTH, HEIGHT, c.rgb);
}

function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  for (const card of CARDS) {
    const png = renderCard(card);
    const outPath = path.join(OUT_DIR, card.file);
    fs.writeFileSync(outPath, png);
    console.log(
      `[og] Generated ${card.file} (${WIDTH}x${HEIGHT}, ${(png.length / 1024).toFixed(1)} KB)`
    );
  }
}

main();
