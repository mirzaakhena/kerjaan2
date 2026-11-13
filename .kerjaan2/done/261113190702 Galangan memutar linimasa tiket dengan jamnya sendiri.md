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

- [x] Tiap kejadian yang terjadi selagi halaman terbuka menjadi satu adegan, berurutan per tiket; dua kejadian yang berdekatan pada satu tiket (misalnya satu kriteria terpenuhi lalu tiket diserahkan) keduanya diputar, tidak ada yang terlewat atau tertimpa.
- [x] Galangan tidak pernah memperlihatkan sesuatu yang belum terjadi di papan; sampai 30 detik tertinggal adegan diputar biasa, lebih dari itu dipercepat (sampai 4 kali) sampai terkejar, dan lebih dari 5 menit tertinggal galangan langsung diletakkan di keadaan sekarang tanpa cerita. Batas itu tertulis di dokumen galangan.
- [x] Halaman yang baru dibuka langsung memperlihatkan keadaan sekarang, tanpa memutar sejarah.
- [x] Lambung bertambah atau berkurang hanya ketika kriteria terpenuhi, dicabut, atau dibatalkan; tidak lagi merayap naik selagi agen bekerja.
- [x] Yang tidak ada di linimasa tetap tampil dari keadaan papan: langkah terakhir agen, uji yang sedang berjalan, agen macet.
- [x] Sambungan yang putus lalu tersambung lagi tidak menghilangkan dan tidak mengulang adegan.
- [x] Mode `?demo` memutar linimasa karangan: satu tiket bisa ditonton dari pesanan sampai berlabuh. `docs/galangan-padanan.md` diperbarui mengikuti cara kerja baru.
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

## Assumptions
- A1 [unseen] Tinggi lambung dihitung dari kriteria bagian worker saja: seperempat sejak lunas, sisanya menurut bagian kriteria yang terpenuhi; kriteria (owner) dan yang dibatalkan tidak dihitung. Tiket yang diserahkan tidak lagi otomatis menaikkan lambung ke penuh.
  Why: Baris Done when ke-4 meminta lambung bergerak hanya saat kriteria terpenuhi, dicabut, atau dibatalkan. Di 0.16.0 lambung berhenti di 85% lalu meloncat ke penuh saat diserahkan; submit sudah mewajibkan semua kriteria worker terpenuhi, jadi dengan hitungan ini lambung sudah penuh sebelum diserahkan.
  If wrong: Ubah buildOf di viewer/web/space/plan.js (satu fungsi) dan angka di uji 'the yard reads the board'.
- A2 [unseen] Bila viewer (k2 view) dinyalakan ulang atau halaman terputus lebih dari 10 menit, galangan diletakkan di keadaan sekarang tanpa cerita; adegan yang terlewat selama itu tidak diputar.
  Why: Titik baca linimasa dari tiket 261113190701 hanya hidup di ingatan server dan berlaku 10 menit; server menjawab 'baca ulang' tanpa sejarah. Ini sejalan dengan batas 5 menit dari Q1. Putus sambungan biasa (server tetap hidup, di bawah 10 menit) tidak kehilangan dan tidak mengulang adegan.
  If wrong: Perlu titik baca yang bertahan di server (perubahan pada jalan linimasa, tiket tersendiri).
- A3 [unseen] Mode demo membuat tiket baru rata-rata tiap 35 detik (sebelumnya 20 detik).
  Why: Tiap pesanan baru kini satu adegan Courier sekitar 30 detik yang tidak lagi dilompati; dengan laju lama galangan demo terus tertinggal dan sering dipercepat.
  If wrong: Ubah satu angka di viewer/web/space/demo.js (dt / 35).

## Decisions
- Lane standard: mesin galangan dirombak, mudah dibatalkan tetapi bukan perubahan kecil.
- Solo dan menunggu 261113190701: tiket ini merombak director.js yang menjadi pijakan semua adegan baru (261113190703, 261113190704, 261113190705, 261113190706, 261113191202), dan membaca jalan linimasa dari 261113190701. Tidak ada yang berjalan di sampingnya.
- Galangan dan papan yang berbeda tanpa kejadian baru diluruskan pada pembacaan kedua, bukan pertama: inti memindahkan berkas tiket dulu baru menulis kejadiannya, jadi satu pembacaan bisa jatuh tepat di antaranya dan adegannya akan hilang.
- Naik-turunnya lambung dijadikan adegan yang ditunggu selesai sebelum kejadian berikutnya pada tiket itu: tanpa itu check, check, uncheck yang datang bersamaan hanya terlihat sebagai satu gerakan ke tinggi akhir.
- Yang dipercepat saat mengejar hanya pemeran yang sedang menjalankan adegan, gerak kapal, dan lambung; pekerjaan pengisi waktu dan laut tetap, supaya galangan tidak tampak seperti video yang dipercepat.

## Manual checks
- M1 [waiting] (item 8) 1. Sesudah tiket ini masuk main, di terminal jalankan viewer dari sumbernya (bukan plugin terpasang): /Users/mirza/Workspace/kerjaan2/bin/k2 view --root /Users/mirza/Workspace --port 4400
  2. Buka http://127.0.0.1:4400/p/k2-akunting/space?demo di peramban dan biarkan tab tetap terlihat.
  3. Di daftar kiri klik Courier, tunggu sampai keterangannya 'carrying the order ...', lalu klik gulungan yang ia taruh di rak ORDERS untuk melihat judul tiketnya. Ingat judul itu.
  4. Ikuti tiket itu sekitar 4 sampai 6 menit: Draughtsman memasangnya di papan QUEUE, Foreman membawanya ke dok, lambung naik setingkat demi setingkat, Inspector memberi tanda centang dan layar dipasang, lalu kapal meluncur dan berlabuh.
  5. Yang seharusnya terlihat: urutan itu tidak pernah terbalik, tidak ada token yang tiba-tiba berpindah tempat, dan lambung hanya naik sesaat sesudah satu langkah selesai (tidak merayap terus). Tiket yang ditolak: Inspector memberi tanda silang, lambung turun satu tingkat, lalu naik lagi.
  6. Pindah ke tab lain 2 menit lalu kembali: adegan berjalan lebih cepat sampai terkejar. Pindah lebih dari 5 menit lalu kembali: semua langsung berada di tempat terbarunya.

## Handoff
Galangan kini memutar linimasa: main.js membaca state lalu timeline (titik baca disimpan), director.update(D, trail) mengantrekan kejadian per tiket, plan.js play() mengubah catatan 'yang sudah diperlihatkan' (tok.see) dan director menjalankan adegan 0.16.0 satu per satu. tok.pic adalah gabungan: hal hidup dari papan, status/lambung/layar dari tok.see; cast.js membaca itu. Jangan dirusak: urutan baca state-dulu-baru-timeline (dasar aturan 'beda tanpa kejadian diletakkan pada pembacaan kedua'), pemeriksaan live() di tiap adegan (adegan bisa dipotong saat mengejar), paceOf (30 detik, 4 kali, 5 menit), dan buildOf (lambung hanya dari kriteria worker). Adegan baru cukup menambah cabang di play() dan satu langkah di story().

## Review
- 2026-11-13 standard, round 1, at 0f8cc8e: passed.
  1: Uji 'the yard plays the trail of a ticket' lulus. Di peramban tanpa layar, papan sekali pakai dengan k2 sungguhan: new, move, start, check, check, uncheck diputar berurutan (deliver, plan, start, lambung 0.5, 0.75, 0.5), tak ada yang tertimpa.
  2: Uji 'the yard is never ahead of the board' lulus (30 dtk 1x, 45 dtk 1.5x, 120-300 dtk 4x, lebih dari 300 dtk diletakkan). Peramban demo: dituakan 100 dtk laju 3.35, langkah pemeran 9.07 lawan 2.54 satuan per detik; dituakan 400 dtk tanpa adegan, sama dengan papan. Batas ada di galangan-padanan.md.
  3: Uji 'a page just opened shows the board as it is' lulus. Di peramban: tiket todo dan in_progress langsung di queue dan slip (lambung 0.5), tertinggal 0, jurnal adegan kosong setelah 4 detik; demo dibuka dengan 7 tiket, tak ada yang sibuk.
  4: Uji 'a hull rises or falls only when' lulus (3600 bingkai worker bekerja, lambung tetap 0.25). Di peramban lambung hanya berubah pada check dan uncheck; di demo naik 0.25, 0.625, 1 dan diam di antaranya. Kata creep tak ada lagi di director.js.
  5: Uji 'what the trail does not carry shows from the board as it is' lulus: langkah agen, uji berjalan, agen macet, pertanyaan tampil seketika dari keadaan; status dan lambung menunggu kejadiannya.
  6: Uji 'a page that lost the viewer and found it again' lulus dengan server dan k2 sungguhan: dua pembacaan gagal, lalu tiap adegan tepat satu kali dan berurutan; titik tak dikenal memberi reread tanpa adegan.
  7: Uji 'the demo makes up a trail too' lulus. Di peramban ?demo satu tiket diikuti 270 detik: mail, shelf, queue, slip, lambung 0.25, 0.625, 1, review, lulus, bay; jurnalnya deliver, plan, start, pass, launch. galangan-padanan.md punya bagian Linimasa.
  8: (owner) M1 bisa diikuti dari awal (perintah viewer, alamat, apa yang diklik) dan berakhir pada apa yang seharusnya terlihat.
  note: Pada penolakan lambung turun dulu baru Inspector memberi tanda silang (jurnal: hull lalu reject); M1 langkah 5 menulis urutan sebaliknya. Pemilik bisa menilainya saat menonton.
  note: Dibaca saja, tidak dijalankan: bila galangan mengejar tepat saat Foreman membawa gulungan dan papan sudah mengembalikan tiket ke todo, dok yang dipesan (tok.slip) tidak dilepas sampai tiket itu mulai lagi atau dibatalkan. Sangat jarang.
  note: Demo laju biasa sempat tertinggal 70 detik dan dipercepat sampai 2.35x (lihat asumsi A3). Konsol peramban mencatat satu 404 saat halaman dimuat, sumbernya tidak ditelusuri. Selain perintah uji, repo tidak punya pemeriksaan lain (tanpa CI atau lint).
