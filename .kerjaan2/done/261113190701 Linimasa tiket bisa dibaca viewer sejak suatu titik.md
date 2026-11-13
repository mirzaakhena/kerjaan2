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

- [x] Halaman bisa meminta kejadian sebuah papan sejak suatu titik dan hanya menerima kejadian sesudah titik itu, berurutan menurut waktu, tiap kejadian menyebut tiketnya.
- [x] Permintaan tanpa titik tidak memberi sejarah, hanya titik "sekarang" untuk dipakai pada permintaan berikutnya.
- [x] Permintaan berturut-turut, masing-masing memakai titik dari jawaban sebelumnya, tidak kehilangan dan tidak mengulang kejadian, juga bila kejadian ditulis di antara dua permintaan.
- [x] Kejadian terakhir tiket yang selesai atau dibatalkan sesudah titik itu (misalnya `landed`) tetap terkirim.
- [x] Titik yang tidak dikenali, atau yang lebih dari 10 menit ke belakang, dijawab seperti permintaan tanpa titik: tanpa sejarah, hanya titik "sekarang", dengan tanda bahwa halaman harus membaca ulang keadaan.
- [x] Baris linimasa yang rusak dilewati dan tidak menggagalkan permintaan.
- [x] Jalan ini hanya menjawab GET dan tidak mengubah apa pun di papan.

## Out of scope

Mengubah halaman galangan supaya memakai jalan ini (tiket pemutar linimasa).

<!-- k2:record — written by k2 only; do not edit by hand -->

## Questions
- Q1 [answered] Titik yang tidak dikenali atau sudah terlalu lama (misalnya halaman tertidur berjam-jam, atau papan diganti) dijawab bagaimana? (a) dijawab seperti permintaan tanpa titik: tanpa sejarah, hanya titik 'sekarang', dengan tanda bahwa halaman harus membaca ulang keadaan; (b) ditolak dengan galat. Saran: (a), supaya halaman selalu bisa pulih sendiri.
  → Pemilik: "Semua ikut saran (Recommended)". Jadi (a): titik yang tidak dikenali atau terlalu lama dijawab seperti permintaan tanpa titik (tanpa sejarah, hanya titik 'sekarang'), dengan tanda bahwa halaman harus membaca ulang keadaan. (owner, 2026-11-13)
- Q2 [answered] Berapa jauh ke belakang satu permintaan boleh memberi kejadian? (a) paling lama 10 menit ke belakang; lebih dari itu dianggap titik terlalu lama (lihat Q1); (b) tanpa batas. Saran: (a), sejalan dengan batas kejar di tiket pemutar (261113190702 Q1).
  → Pemilik: "Semua ikut saran (Recommended)". Jadi (a): paling lama 10 menit ke belakang; lebih dari itu dianggap titik terlalu lama. (owner, 2026-11-13)

## Assumptions
- A1 [confirmed] Batas 10 menit dihitung dari saat titik terakhir kali masih 'sekarang' (saat diberikan atau diberikan ulang karena belum ada tulisan baru), bukan dari waktu kejadian
  Why: Halaman yang terus bertanya di papan yang sepi tidak boleh dipaksa membaca ulang tiap 10 menit; halaman yang tertidur tetap kedaluwarsa
  If wrong: Di timeline() viewer/server.mjs, jangan segarkan seen saat titik dibagikan ulang
  Confirmed by owner, 2026-11-13

## Decisions
- Lane standard: jalan baca baru di server viewer, dengan uji; bukan uang atau data yang tak bisa dipulihkan.
- Tidak menunggu apa pun dan tidak solo: hanya menyentuh server viewer, bisa berjalan di samping 261113190707 dan 261113191201.
- Titik disimpan di ingatan server, bukan dikodekan ke dalam titik itu sendiri: posisi per berkas terlalu panjang untuk alamat pada papan besar, dan waktu linimasa hanya berketelitian detik sehingga titik berupa waktu bisa kehilangan atau mengulang kejadian. Akibatnya server yang dinyalakan ulang menjawab reread.

## Handoff
Viewer punya alamat baru GET /api/p/<proyek>/timeline?since=<titik>, menjawab { now, point, reread, events }. Titik adalah nama acak untuk posisi baca (byte baris utuh dan inode) tiap berkas linimasa, disimpan hanya di ingatan server (startServer), dibaca oleh trailSince di viewer/snapshot.mjs. Selama tidak ada tulisan, titik terbaru dibagikan ulang dan umurnya disegarkan. Yang tidak boleh rusak: viewer tidak menulis apa pun; linimasa dianggap hanya bertambah di ujung (berkas menyusut atau berganti berarti reread); hanya baris utuh yang dikirim; urutan menurut waktu, dalam satu tiket menurut urutan tulis. startServer menerima clock hanya untuk uji.

## Review
- 2026-11-13 standard, round 1, at 5fb237d: passed.
  1: Pemeriksa sendiri di server sungguhan: sesudah titik, k2 start dan tiket baru; jawaban persis dua baris yang ditulis sesudah titik, terurut waktu, tiap kejadian ber-ticket. Dua uji 'the trail...' lulus menurut nama.
  2: Permintaan tanpa since pada papan yang sudah punya sejarah menjawab events [], reread false, point berupa string.
  3: Tujuh permintaan berantai dengan perintah k2 di antaranya (dua tanpa tulisan): ganda 0, hilang 0, lebih 0 dibanding isi berkas; dua halaman dengan titik berbeda menerima jumlah yang sama. Uji baris separuh tertulis lulus.
  4: k2 move cancel sesudah titik: moved ke cancel terkirim, dan tidak terkirim lagi dari titik baru. Landed: uji 'the last event of a ticket that landed' lulus menurut nama, memakai k2 land sungguhan.
  5: Titik asal-asalan ('xyz', kosong, titik sah + satu huruf, 'toString'): events 0, reread true, titik baru. Jam buatan: tepat 10 menit masih dijawab; 10 menit + 1 ms dan 11 menit tertidur: events 0, reread true.
  6: Baris sampah, JSON terpotong, larik, waktu ngawur, tanpa waktu ditambahkan ke linimasa: jawaban 200, reread false, hanya dua kejadian sah yang terkirim.
  7: POST/PUT/DELETE/PATCH/OPTIONS dijawab 405; sidik semua berkas .kerjaan2 (ukuran, mtime, inode) dan git status sama sebelum dan sesudah 60 GET.
  note: HEAD dijawab 200, sama seperti semua alamat server viewer sebelum tiket ini; tidak menulis apa pun.
  note: Di uji 'one request after another', komentar 'Two pages, each with its own points' tidak cocok dengan isinya (yang diperiksa: titik server lain dijawab reread). Kriteria 3 terbukti dengan cara lain.
  note: Tidak ada pemeriksaan lain di repo selain perintah uji (tanpa CI, tanpa skrip lint).
