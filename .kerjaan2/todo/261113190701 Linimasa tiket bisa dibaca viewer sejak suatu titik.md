---
type: feature
priority: medium
lane: standard
labels: []
blocked_by: []
related: []
touches: [viewer/server.mjs, viewer/snapshot.mjs, tests/viewer.test.mjs]
created: 2026-11-13 19:07
---

## Background

Halaman galangan (`k2 view`, halaman 3D tiap papan) sekarang hanya menerima
keadaan papan dan kejadian terakhir tiap tiket. Pemilik memutuskan galangan
memutar hidup tiket kejadian demi kejadian (keputusan 24 di
`docs/galangan-tahap2.md`). Untuk itu halaman perlu semua kejadian linimasa
sejak titik yang sudah ia lihat, bukan hanya yang terakhir. Viewer hanya
membaca papan dan tidak pernah menulis; itu tetap berlaku.

Ini tiket pertama dari tujuh untuk galangan tahap 2; pemutar linimasa
dibangun di atasnya.

## Request

Viewer menyediakan jalan hanya-baca untuk mengambil kejadian linimasa
tiket-tiket sebuah papan sejak suatu titik, sehingga halaman yang terbuka
tidak melewatkan kejadian dan tidak menerima kejadian yang sama dua kali.

## Done when

- [ ] Halaman bisa meminta kejadian sebuah papan sejak suatu titik dan hanya menerima kejadian sesudah titik itu, berurutan menurut waktu, tiap kejadian menyebut tiketnya.
- [ ] Permintaan tanpa titik tidak memberi sejarah, hanya titik "sekarang" untuk dipakai pada permintaan berikutnya.
- [ ] Permintaan berturut-turut, masing-masing memakai titik dari jawaban sebelumnya, tidak kehilangan dan tidak mengulang kejadian, juga bila kejadian ditulis di antara dua permintaan.
- [ ] Kejadian terakhir tiket yang selesai atau dibatalkan sesudah titik itu (misalnya `landed`) tetap terkirim.
- [ ] Titik yang tidak dikenali, atau yang lebih dari 10 menit ke belakang, dijawab seperti permintaan tanpa titik: tanpa sejarah, hanya titik "sekarang", dengan tanda bahwa halaman harus membaca ulang keadaan.
- [ ] Baris linimasa yang rusak dilewati dan tidak menggagalkan permintaan.
- [ ] Jalan ini hanya menjawab GET dan tidak mengubah apa pun di papan.

## Out of scope

Mengubah halaman galangan supaya memakai jalan ini (tiket pemutar linimasa).

<!-- k2:record — written by k2 only; do not edit by hand -->

## Questions
- Q1 [answered] Titik yang tidak dikenali atau sudah terlalu lama (misalnya halaman tertidur berjam-jam, atau papan diganti) dijawab bagaimana? (a) dijawab seperti permintaan tanpa titik: tanpa sejarah, hanya titik 'sekarang', dengan tanda bahwa halaman harus membaca ulang keadaan; (b) ditolak dengan galat. Saran: (a), supaya halaman selalu bisa pulih sendiri.
  → Pemilik: "Semua ikut saran (Recommended)". Jadi (a): titik yang tidak dikenali atau terlalu lama dijawab seperti permintaan tanpa titik (tanpa sejarah, hanya titik 'sekarang'), dengan tanda bahwa halaman harus membaca ulang keadaan. (owner, 2026-11-13)
- Q2 [answered] Berapa jauh ke belakang satu permintaan boleh memberi kejadian? (a) paling lama 10 menit ke belakang; lebih dari itu dianggap titik terlalu lama (lihat Q1); (b) tanpa batas. Saran: (a), sejalan dengan batas kejar di tiket pemutar (261113190702 Q1).
  → Pemilik: "Semua ikut saran (Recommended)". Jadi (a): paling lama 10 menit ke belakang; lebih dari itu dianggap titik terlalu lama. (owner, 2026-11-13)

## Decisions
- Lane standard: jalan baca baru di server viewer, dengan uji; bukan uang atau data yang tak bisa dipulihkan.
- Tidak menunggu apa pun dan tidak solo: hanya menyentuh server viewer, bisa berjalan di samping 261113190707 dan 261113191201.
