---
type: feature
priority: medium
lane: standard
labels: []
blocked_by: []
related: []
touches: []
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
- [ ] Galangan tidak pernah memperlihatkan sesuatu yang belum terjadi di papan; bila tertinggal lebih dari batas tertentu, adegan dipercepat sampai terkejar. Batas itu tertulis di dokumen galangan.
- [ ] Halaman yang baru dibuka langsung memperlihatkan keadaan sekarang, tanpa memutar sejarah.
- [ ] Lambung bertambah atau berkurang hanya ketika kriteria terpenuhi, dicabut, atau dibatalkan; tidak lagi merayap naik selagi agen bekerja.
- [ ] Yang tidak ada di linimasa tetap tampil dari keadaan papan: langkah terakhir agen, uji yang sedang berjalan, agen macet.
- [ ] Sambungan yang putus lalu tersambung lagi tidak menghilangkan dan tidak mengulang adegan.
- [ ] Mode `?demo` memutar linimasa karangan: satu tiket bisa ditonton dari pesanan sampai berlabuh. `docs/galangan-padanan.md` diperbarui mengikuti cara kerja baru.
- [ ] (owner) Di mode `?demo`, hidup satu tiket terlihat berurutan dan tidak ada loncatan yang janggal.

## Out of scope

Adegan baru apa pun; tombol putar ulang hidup satu tiket; derek, kapal tunda,
menara, malam (belum diputuskan pemilik).
