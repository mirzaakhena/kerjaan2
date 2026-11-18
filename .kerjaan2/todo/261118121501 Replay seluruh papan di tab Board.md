---
type: feature
priority: medium
lane: standard
labels: []
blocked_by: []
related: [261113190701]
touches: []
created: 2026-11-18 12:15
---

## Background

Tab Board di viewer memperlihatkan tiap tiket di kolom statusnya saat ini
saja. Sejarah tiap tiket (dibuat, dipindah, dikerjakan, ditinjau, ditolak,
berlabuh) sudah tercatat lengkap di jejak mesin papan, tetapi viewer hanya
mau memberikan kejadian sampai 10 menit ke belakang, dan belum ada cara
menonton perjalanan papan dari awal.

## Request

Tab Board punya mode replay: papan dimulai dari keadaan sebelum tiket
pertama ada, lalu seluruh sejarahnya diputar sampai keadaan sekarang. Kartu
muncul, berpindah kolom, dan selesai mengikuti kejadian yang tercatat.
Penonton bisa memutar, menjeda, memilih kecepatan, dan menggeser ke titik
waktu mana pun. Viewer tetap hanya membaca.

## Done when

- [ ] Di tab Board ada tombol untuk masuk ke mode replay dan keluar lagi ke papan langsung; selama replay jelas terlihat bahwa yang tampil adalah sejarah, bukan keadaan sekarang.
- [ ] Replay mulai dari papan kosong sebelum tiket pertama dibuat, dan berakhir tepat di keadaan papan saat replay dibuka: tiap tiket ada di kolom yang sama dengan papan langsung.
- [ ] Tiap perpindahan tiket yang tercatat (termasuk ditolak peninjau lalu kembali dikerjakan, dan dibatalkan) terlihat sebagai kartu yang berpindah kolom, berurutan menurut waktu.
- [ ] Ada tombol putar/jeda, beberapa pilihan kecepatan, dan bilah waktu yang bisa digeser; menggeser ke suatu titik langsung memperlihatkan papan persis seperti pada saat itu.
- [ ] Jam replay (tanggal dan jam kejadian yang sedang tampil) selalu terlihat.
- [ ] Jeda panjang tanpa kejadian dilewati dengan singkat, sehingga sejarah berhari-hari tidak perlu ditonton berjam-jam.
- [ ] Kejadian baru yang masuk selagi replay berjalan tidak merusak replay, dan terlihat begitu penonton kembali ke papan langsung.
- [ ] (owner) Di papan kerjaan2 sendiri, replay dari awal sampai akhir enak ditonton dan tidak ada loncatan yang janggal.

## Out of scope

Replay di galangan 3D dan di Control room; replay per sesi atau per
rentang waktu yang dipilih.
