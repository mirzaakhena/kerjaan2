---
type: feature
priority: medium
lane: standard
solo: true
labels: []
blocked_by: [261113190701]
related: []
touches: [viewer/web/space/director.js, viewer/web/space/plan.js, viewer/web/space/main.js, viewer/web/space/demo.js, viewer/web/space/cast.js, tests/viewer.test.mjs, docs/galangan-padanan.md]
created: 2026-11-13 19:07
---

## Background

Galangan 0.16.0 membandingkan keadaan papan dari satu pembacaan ke pembacaan
berikutnya, lalu membawa tiap tiket ke tempat barunya. Kejadian yang terjadi
di antara dua pembacaan hilang, dan adegan tidak bisa mengikuti urutan yang
sebenarnya. Pemilik memutuskan (keputusan 24 dan 33 di
`docs/galangan-tahap2.md`): galangan memutar linimasa tiket, tiap kejadian
satu adegan, dengan jam sendiri yang boleh tertinggal dari papan; dan lambung
yang "merayap naik selama agen bekerja" dibuang. Tabel "Pemetaan linimasa ke
adegan" di berkas itu adalah usul awalnya.

Tiket ini mengganti mesinnya saja. Adegan baru (perahu rombongan, perencana,
tukang menjemput, drama review) ada di tiket-tiket sesudahnya; di sini tiap
kejadian memakai adegan yang sudah ada di 0.16.0.

## Request

Galangan memutar kejadian linimasa tiap tiket sebagai adegan yang berurutan,
dengan jamnya sendiri: boleh tertinggal dari papan, tidak pernah mendahului,
dan mengejar dengan mempercepat adegan bila tertinggal terlalu jauh. Mode
`?demo` ikut menghasilkan linimasa supaya semuanya bisa ditonton tanpa sesi
sungguhan.

## Done when

- [ ] Tiap kejadian yang terjadi selagi halaman terbuka menjadi satu adegan, berurutan per tiket; dua kejadian yang berdekatan pada satu tiket (misalnya satu kriteria terpenuhi lalu tiket diserahkan) keduanya diputar, tidak ada yang terlewat atau tertimpa.
- [ ] Galangan tidak pernah memperlihatkan sesuatu yang belum terjadi di papan; sampai 30 detik tertinggal adegan diputar biasa, lebih dari itu dipercepat (sampai 4 kali) sampai terkejar, dan lebih dari 5 menit tertinggal galangan langsung diletakkan di keadaan sekarang tanpa cerita. Batas itu tertulis di dokumen galangan.
- [ ] Halaman yang baru dibuka langsung memperlihatkan keadaan sekarang, tanpa memutar sejarah.
- [ ] Lambung bertambah atau berkurang hanya ketika kriteria terpenuhi, dicabut, atau dibatalkan; tidak lagi merayap naik selagi agen bekerja.
- [ ] Yang tidak ada di linimasa tetap tampil dari keadaan papan: langkah terakhir agen, uji yang sedang berjalan, agen macet.
- [ ] Sambungan yang putus lalu tersambung lagi tidak menghilangkan dan tidak mengulang adegan.
- [ ] Mode `?demo` memutar linimasa karangan: satu tiket bisa ditonton dari pesanan sampai berlabuh. `docs/galangan-padanan.md` diperbarui mengikuti cara kerja baru.
- [ ] (owner) Di mode `?demo`, hidup satu tiket terlihat berurutan dan tidak ada loncatan yang janggal.

## Out of scope

Adegan baru apa pun; tombol putar ulang hidup satu tiket; derek, kapal tunda,
menara, malam (belum diputuskan pemilik).

<!-- k2:record — written by k2 only; do not edit by hand -->

## Questions
- Q1 [answered] Berapa batas tertinggal dan bagaimana mengejarnya? Saran: sampai 30 detik tertinggal adegan diputar biasa; lebih dari itu dipercepat (sampai 4 kali); lebih dari 5 menit tertinggal (misalnya tab lama tersembunyi atau laptop ditutup) galangan langsung diletakkan di keadaan sekarang tanpa cerita, seperti halaman yang baru dibuka. Pilihan lain: (b) selalu memutar semuanya dipercepat berapa pun tertinggalnya; (c) angka lain dari pemilik.
  → Pemilik: "Semua ikut saran (Recommended)". Jadi (a): sampai 30 detik tertinggal diputar biasa; lebih dari itu dipercepat (sampai 4 kali); lebih dari 5 menit tertinggal galangan langsung diletakkan di keadaan sekarang tanpa cerita. (owner, 2026-11-13)
- Q2 [answered] Kejadian yang di 0.16.0 belum punya adegan (test, integrate, integrated, conflict, held, question, answer, assumption*, manual*, accepted, amended, released, retry): di tiket ini (a) dilewati tanpa adegan, dan yang sudah tampil dari keadaan papan tetap tampil (lampu uji, balon '?', bendera menara); atau (b) 'test' ikut diberi adegan baru: lampu dok hijau atau merah sesaat, seperti di tabel usul. Saran: (a); lampu sesaat tidak termasuk keputusan 24-33 dan tiket ini sudah penuh.
  → Pemilik: "Semua ikut saran (Recommended)". Jadi (a): kejadian yang belum punya adegan di 0.16.0 dilewati tanpa adegan; yang tampil dari keadaan papan tetap tampil. Tidak ada lampu uji sesaat di tiket ini. (owner, 2026-11-13)
- Q3 [answered] Keputusan 31 (cancel tanpa cerita, token menghilang pelan) tidak ada di tujuh tiket. Planner membuat tiket kecil 261113191202 untuk itu (lane light, sesudah tiket ini). (a) setuju, 261113191202 ikut diantrekan; (b) jadikan satu baris Done when di tiket ini (menjadi 9 baris); (c) tunda, 261113191202 tetap di backlog dan cancel masih bercerita seperti 0.16.0. Saran: (a).
  → Pemilik: "Semua ikut saran (Recommended)". Jadi (a): tiket kecil 261113191202 ikut diantrekan; cancel tidak ditambahkan ke tiket ini. (owner, 2026-11-13)
- Q4 [answered] Tiket yang mundur (misalnya todo kembali ke backlog, atau ditolak lalu dibuka lagi dari done): tetap langsung diletakkan tanpa cerita seperti di 0.16.0? (a) ya; (b) diberi adegan mundur. Saran: (a).
  → Pemilik: "Semua ikut saran (Recommended)". Jadi (a): tiket yang mundur tetap langsung diletakkan tanpa cerita. (owner, 2026-11-13)

## Decisions
- Lane standard: mesin galangan dirombak, mudah dibatalkan tetapi bukan perubahan kecil.
- Solo dan menunggu 261113190701: tiket ini merombak director.js yang menjadi pijakan semua adegan baru (261113190703, 261113190704, 261113190705, 261113190706, 261113191202), dan membaca jalan linimasa dari 261113190701. Tidak ada yang berjalan di sampingnya.
