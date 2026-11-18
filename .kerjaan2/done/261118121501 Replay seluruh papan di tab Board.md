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

- [x] Di tab Board ada tombol untuk masuk ke mode replay dan keluar lagi ke papan langsung; selama replay jelas terlihat bahwa yang tampil adalah sejarah, bukan keadaan sekarang.
- [x] Replay mulai dari papan kosong sebelum tiket pertama dibuat, dan berakhir tepat di keadaan papan saat replay dibuka: tiap tiket ada di kolom yang sama dengan papan langsung.
- [x] Tiap perpindahan tiket yang tercatat (termasuk ditolak peninjau lalu kembali dikerjakan, dan dibatalkan) terlihat sebagai kartu yang berpindah kolom, berurutan menurut waktu.
- [x] Ada tombol putar/jeda, beberapa pilihan kecepatan, dan bilah waktu yang bisa digeser; menggeser ke suatu titik langsung memperlihatkan papan persis seperti pada saat itu.
- [x] Jam replay (tanggal dan jam kejadian yang sedang tampil) selalu terlihat.
- [x] Jeda panjang tanpa kejadian dilewati dengan singkat, sehingga sejarah berhari-hari tidak perlu ditonton berjam-jam.
- [x] Kejadian baru yang masuk selagi replay berjalan tidak merusak replay, dan terlihat begitu penonton kembali ke papan langsung.
- [ ] (owner) Di papan kerjaan2 sendiri, replay dari awal sampai akhir enak ditonton dan tidak ada loncatan yang janggal.

## Out of scope

Replay di galangan 3D dan di Control room; replay per sesi atau per
rentang waktu yang dipilih.

<!-- k2:record — written by k2 only; do not edit by hand -->

## Assumptions
- A1 [confirmed] Kecepatan replay dinyatakan sebagai menit sejarah per detik (1 min/s, 5 min/s, 20 min/s, 1 h/s), bawaan 5 min/s; jeda tanpa kejadian lebih dari 3 menit diputar sebagai 3 menit sejarah.
  Why: Papan kerjaan2 dengan sejarah 5 hari jadi sekitar 35 detik pada bawaan, cukup untuk mengikuti tiap perpindahan.
  If wrong: Ubah SPEEDS dan default speed di viewer/web/app.js, atau QUIET di viewer/web/replay.js.
  Confirmed by owner, 2026-11-18
- A2 [confirmed] Kartu replay hanya memperlihatkan nomor, judul, jalur, dan kejadian jejak terakhirnya pada saat itu, bukan lencana dan pil Done when hari ini.
  Why: Lencana dan pil adalah keadaan sekarang; menampilkannya di sejarah akan menyesatkan.
  If wrong: Tambahkan pil atau lencana di replayCard di viewer/web/app.js.
  Confirmed by owner, 2026-11-18

## Manual checks
- M1 [waiting] (item 8) 1. Setelah /plugin update kerjaan2, jalankan k2 view di repo kerjaan2 dan buka http://127.0.0.1:4322/p/kerjaan2/?tab=board
  2. Klik '▶ Replay' di baris alat
  3. Tonton pada 5 min/s dari papan kosong sampai akhir (sekitar setengah menit); coba juga 20 min/s dan geser bilah ke beberapa titik
  Harus terlihat: kartu muncul lalu terbang antar kolom berurutan, jeda malam dilewati singkat tanpa loncatan janggal, dan di akhir papan sama dengan papan langsung

## Handoff
Tab Board punya mode replay. Server memberi seluruh sejarah lewat GET /api/p/<proyek>/history (boardHistory di snapshot.mjs): tiap tiket membawa langkah kolom yang dihitung columnAfter dari jejak (created, moved, started, submitted, verdict tolak, accepted, landed, amended dan answer --differs saat review); langkah 'untracked' ditambahkan bila jejak tidak berakhir di kolom sekarang, jadi replay selalu berakhir di papan saat dibuka. viewer/web/replay.js murni (jam dua lapis, jeda sepi dipadatkan) dan diuji lewat vm. app.js: replay tidak masuk alamat, berhenti saat tab berganti, dan pembaruan papan selagi replay hanya menggambar ulang bilah atas. Bila core menambah perpindahan status baru, columnAfter harus ikut.

## Review
- 2026-11-18 standard, round 1, at e44e2d3: passed.
  1: Playwright pada salinan papan kerjaan2: tombol Replay ada; bilah 'Replay · history' muncul dan #board bergaris (replaying); Back to live menghapus bilah; pindah tab lalu kembali juga menutup replay.
  2: Peramban: awal 0 kartu (19:07:00); digeser ke akhir, tiap kolom sama dengan papan langsung. boardHistory+replay.js pada salinan: 16 tiket, 0 selisih, 0 langkah untracked. Uji 'the history of a board' lulus.
  3: Uji 'the history of a board' lulus (tolak lalu dikerjakan lagi, dan cancel, berurutan). columnAfter dicocokkan dengan tiap B.moveFile di core. Peramban: sampai 12 kartu terbang dalam 4 detik pertama.
  4: Peramban: Play/Pause berganti dan jam berhenti saat dijeda; 1/5/20 min/s dan 1 h/s; geser ke tengah langsung 12 kartu pada 22:11:57. Uji 'the replay clock' memeriksa papan tepat di tiap titik.
  5: #r-clock bertanggal tampil saat diputar, dijeda dan digeser (2026-11-13 19:07:00, 19:33:43, 22:11:57).
  6: Uji 'the replay clock': tiga hari jadi LEAD+1m+3xQUIET+5s. Salinan papan: 4,7 hari diputar 36,3 detik pada 5 min/s; bilah menulis '43m 25s with no event, skipped'.
  7: Peramban: replay dijeda, tiket backlog dipindah ke todo pada salinan: jam dan kartu tetap, catatan 'The board moved since' muncul; Back to live menampilkannya di todo; replay baru berakhir dengan tiket itu di todo.
  8: (owner) M1 berisi langkah dari awal sampai yang harus terlihat; tidak dinilai.
  note: k2 view ditolak untuk reviewer, jadi server dijalankan lewat startServer dalam proses seperti uji viewer. Repo tak punya pemeriksaan lain. Asersi urutan akhir di uji history lemah, tapi urutan dibuktikan deepEqual langkah. Salinan /tmp/k2-review-261118121501 tidak dihapus.
