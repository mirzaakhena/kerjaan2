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

Papan tidak mencatat kapan planner sedang bekerja, hanya hasilnya: di galangan
0.16.0 Draughtsman baru bergerak sesudah tiket sudah pindah ke todo. Worker
dan reviewer dicatat papan saat dikirim; planner dikenali tetapi tidak
dicatat, dan ia tidak terikat pada satu tiket. Tiket todo sekarang berupa
gulungan di papan QUEUE, dan tiket yang masih menunggu tiket lain tampil sama
dengan yang siap. Pemilik memutuskan (keputusan 26 di
`docs/galangan-tahap2.md`): satu karakter perencana membaca papan pesanan
selama planner bekerja, lalu memindahkan tiket ke meja todo. Tiket ini
dibangun di atas pemutar linimasa.

## Request

Papan mencatat kapan planner bekerja, dan galangan memperlihatkannya: si
perencana (Naval Architect, menggantikan Draughtsman) mendatangi papan pesanan
dan membaca tiket-tiket selama planner bekerja, memakai simbol `?` bila
planner bertanya, lalu memindahkan tiket ke meja todo: meja panjang dengan
tiket berjejer, yang masih menunggu tiket lain di baris belakang.

## Done when

- [ ] Papan mencatat saat planner dikirim dan saat ia selesai, tanpa terikat pada satu tiket, dan halaman viewer bisa membacanya.
- [ ] Selama planner bekerja, si perencana berada di papan pesanan dan membaca tiket; di luar itu tidak.
- [ ] Selama ada pertanyaan planner yang menunggu pemilik, si perencana memakai simbol `?`; simbol itu hilang setelah terjawab.
- [ ] Tiket yang masuk todo dipindahkan si perencana ke meja todo dan berjejer di sana menurut urutan antrean.
- [ ] Tiket todo yang harus menunggu tiket lain diletakkan di baris belakang, dan maju ke baris depan begitu tidak lagi menunggu.
- [ ] Di daftar pemeran, si perencana bernama Naval Architect; Draughtsman tidak ada lagi.
- [ ] Mode `?demo` memperlihatkan perencana membaca, bertanya, dan memindahkan tiket. `docs/galangan-padanan.md` diperbarui.
- [ ] (owner) Perencana dan meja todo enak ditonton; baris depan dan baris belakang mudah dibedakan.

## Out of scope

Karakter baru untuk si perencana (pilihan bentuk ditunda; pakai karakter
Draughtsman yang sekarang). Bentuk akhir meja todo: pakai calon yang ada di
ruang pamer, pilihan lain ditunda.
