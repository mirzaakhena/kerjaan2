---
type: feature
priority: medium
lane: standard
labels: []
blocked_by: [261113190702, 261113191201]
related: [261113191201, 261113190705]
touches: [viewer/web/space/director.js, viewer/web/space/world.js, viewer/web/space/cast.js, viewer/web/space/plan.js, viewer/web/space/demo.js, tests/viewer.test.mjs, docs/galangan-padanan.md]
created: 2026-11-13 19:07
---

## Background

Di galangan 0.16.0 Draughtsman baru bergerak sesudah tiket sudah pindah ke
todo: papan tidak mencatat kapan planner sedang bekerja. Catatan itu dibuat
oleh tiket "Papan mencatat kapan planner bekerja" (261113191201), yang dipecah
dari tiket ini; di sini galangan memakainya. Tiket todo sekarang berupa
gulungan di papan QUEUE, dan tiket yang masih menunggu tiket lain tampil sama
dengan yang siap. Pemilik memutuskan (keputusan 26 di
`docs/galangan-tahap2.md`): satu karakter perencana membaca papan pesanan
selama planner bekerja, lalu memindahkan tiket ke meja todo. Tiket ini
dibangun di atas pemutar linimasa.

## Request

Galangan memperlihatkan planner bekerja: si perencana (Naval Architect,
menggantikan Draughtsman) mendatangi papan pesanan dan membaca tiket-tiket
selama planner bekerja, memakai simbol `?` bila planner bertanya, lalu
memindahkan tiket ke meja todo: meja panjang dengan tiket berjejer, yang masih
menunggu tiket lain di baris belakang.

## Done when

- [x] Selama papan mencatat planner bekerja, si perencana berada di papan pesanan dan membaca tiket; di luar itu tidak.
- [x] Selama ada pertanyaan planner yang menunggu pemilik, si perencana memakai simbol `?`; simbol itu hilang setelah terjawab.
- [x] Tiket yang masuk todo dipindahkan si perencana ke meja todo dan berjejer di sana menurut urutan antrean.
- [x] Tiket todo yang harus menunggu tiket lain diletakkan di baris belakang, dan maju ke baris depan begitu tidak lagi menunggu.
- [x] Di daftar pemeran, si perencana bernama Naval Architect; Draughtsman tidak ada lagi.
- [x] Mode `?demo` memperlihatkan perencana membaca, bertanya, dan memindahkan tiket. `docs/galangan-padanan.md` diperbarui.
- [ ] (owner) Perencana dan meja todo enak ditonton; baris depan dan baris belakang mudah dibedakan.

## Out of scope

Karakter baru untuk si perencana (pilihan bentuk ditunda; pakai karakter
Draughtsman yang sekarang). Bentuk akhir meja todo: pakai calon yang ada di
ruang pamer, pilihan lain ditunda.

<!-- k2:record — written by k2 only; do not edit by hand -->

## Questions
- Q1 [answered] Di antara dua giliran planner (planner sudah berhenti, pertanyaannya menunggu pemilik), si perencana di mana? (a) tetap di papan pesanan, diam dengan balon '?', sampai semua pertanyaan planner terjawab; (b) kembali ke mejanya dengan balon '?'. Saran: (a), supaya terlihat apa yang ia tunggu.
  → Pemilik: "Semua ikut saran (Recommended)". Jadi (a): di antara dua giliran planner si perencana tetap di papan pesanan, diam dengan balon '?', sampai semua pertanyaan planner terjawab. (owner, 2026-11-13)
- Q2 [answered] Tiket todo mana yang masuk baris belakang? (a) yang belum bisa mulai karena tiket lain: blocked_by yang belum landed, atau ada tiket solo yang harus selesai dulu; tiket yang dijeda pemilik (pause-before) tetap di baris depan; (b) hanya yang blocked_by-nya belum landed; (c) semua yang oleh 'k2 ready'/'k2 next' belum boleh mulai, termasuk yang dijeda. Saran: (a): baris belakang berarti 'menunggu tiket lain', jeda adalah menunggu pemilik.
  → Pemilik: "Semua ikut saran (Recommended)". Jadi (a): baris belakang untuk tiket yang belum bisa mulai karena tiket lain (blocked_by belum landed, atau ada tiket solo yang harus selesai dulu); tiket yang dijeda pemilik tetap di baris depan. (owner, 2026-11-13)
- Q3 [answered] Beberapa tiket pindah ke todo hampir bersamaan (planner memindahkan seluruh antrean sekaligus): (a) si perencana membawa semuanya dalam satu jalan lalu menjejerkannya; (b) satu tiket tiap jalan. Saran: (a), seperti rombongan perahu; (b) lama untuk 7 tiket.
  → Pemilik: "Semua ikut saran (Recommended)". Jadi (a): tiket yang pindah ke todo hampir bersamaan dibawa dalam satu jalan lalu dijejerkan. (owner, 2026-11-13)
- Q4 [answered] Adegan lama 'Draughtsman menggambar di meja DRAWINGS sebelum memasang di papan' dibuang? (a) ya: si perencana membaca di papan pesanan lalu langsung membawa tiket ke meja todo; meja gambar tinggal sebagai tempatnya saat senggang; papan QUEUE diganti meja todo; (b) adegan menggambar dipertahankan di tengah jalan. Saran: (a), sesuai keputusan 26.
  → Pemilik: "Semua ikut saran (Recommended)". Jadi (a): adegan menggambar di meja DRAWINGS dibuang; si perencana membaca di papan pesanan lalu langsung membawa tiket ke meja todo; meja gambar menjadi tempatnya saat senggang; papan QUEUE diganti meja todo. (owner, 2026-11-13)
- Q5 [answered] Berapa tiket yang muat di meja todo? Sekarang papan QUEUE memuat 8 dan sisanya tidak digambar. (a) 8 di baris depan dan 8 di baris belakang, sisanya tidak digambar (batas yang sama seperti sekarang, dicatat di dokumen); (b) meja memanjang mengikuti jumlah tiket. Saran: (a).
  → Pemilik: "Semua ikut saran (Recommended)". Jadi (a): 8 di baris depan dan 8 di baris belakang, sisanya tidak digambar; batas ini dicatat di dokumen. (owner, 2026-11-13)

## Assumptions
- A1 [confirmed] Pertanyaan planner adalah pertanyaan yang belum terjawab dan dicatat oleh planner (kejadian 'question' dengan 'by' berawalan 'planner:').
  Why: Linimasa sudah mencatat siapa yang menjalankan tiap langkah (field 'by' dari role guard); tidak perlu catatan baru.
  If wrong: Ganti dengan: semua pertanyaan belum terjawab pada tiket di backlog.
  Confirmed by owner, 2026-11-13
- A2 [confirmed] Tiket solo ikut aturan baris belakang dengan hitungan sederhana: semua tiket todo ke belakang selama ada tiket solo berstatus in_progress atau review; tiket solo sendiri ke belakang selama ada tiket yang mengisi tempat. Tiket di belakang tiket solo yang menunggu tetap di depan.
  Why: Jawaban Q2 menyebut tiket solo yang harus selesai dulu; k2 next punya rincian lebih halus yang tidak ada di snapshot.
  If wrong: Ubah waitsOnAnother di viewer/web/space/plan.js.
  Confirmed by owner, 2026-11-13
- A3 [confirmed] docs/blueprint.md diberi satu bagian pendek di akhir tentang perencana dan meja todo, seperti yang dilakukan tiket pemutar linimasa; docs/galangan-alur.html (alur 0.16.0) tidak diubah.
  Why: Blueprint mencatat tiap keputusan pemilik; tiket hanya meminta galangan-padanan.md.
  If wrong: Hapus bagian terakhir docs/blueprint.md.
  Confirmed by owner, 2026-11-13

## Decisions
- Lane standard: adegan dan benda baru di galangan. Menunggu 261113190702 (antrean adegan) dan 261113191201 (catatan planner di papan).
- Dipecah: catatan planner di inti dan hook menjadi tiket 261113191201, supaya bagian inti bisa dicoba sendiri dan berjalan lebih dulu di samping tiket lain.
- Tempat membaca si perencana adalah stations.reading, di samping rak ORDERS dan di luar atapnya: di bawah atap ia dan balonnya tidak terlihat dari sudut kamera awal.
- Baris meja todo dan keadaan planner dibaca dari keadaan papan, bukan dari linimasa: tampil seketika, seperti urutan antrean. Hanya perpindahan ke todo yang berupa adegan.

## Manual checks
- M1 [waiting] (item 7) 1. Jalankan k2 view lalu buka /p/<proyek>/space?demo.
  2. Tunggu sekitar 10 detik: Naval Architect berjalan ke samping gudang ORDERS dan membaca.
  3. Sekitar detik ke-25 ia diam dengan balon ?, lalu membaca lagi.
  4. Sekitar detik ke-45 ia membawa gulungan ke meja bertanda TODO di antara gudang DRAWINGS dan INSPECTION.
  5. Dekatkan kamera ke meja itu: gulungan berpita merah di baris depan (dekat laut), berpita abu-abu di baris belakang. Yang diharapkan: perencana dan meja enak ditonton, dan kedua baris mudah dibedakan.

## Handoff
Draughtsman menjadi Naval Architect dengan tugas baru (plannerDuty di director.js): membaca di samping papan pesanan selama live.planner ada, balon ? selama ada pertanyaan planner yang belum terjawab. Snapshot memberi plannerAsks per tiket (kejadian question yang by-nya planner:). Papan QUEUE diganti meja todo: world.queueSlots baris depan, world.waitSlots baris belakang, masing-masing 8; pic.waiting (plan.js) menentukan baris. Adegan plan kini satu jalan untuk serombongan (dir.walk). Jangan rusak: nama tempat 'queue' dan stations.queue tetap dipakai adegan start; tok.slot diisi layout; demo membatasi todo agar muat di meja.

## Review
- 2026-11-13 standard, round 1, at f49b0a9: passed.
  1: Uji 'the architect reads the order board...' lulus lewat k2 test: papan sungguhan, planner dicatat hook; saat bekerja ia ke papan pesanan dan membaca, selain itu tidak. Gagal di salinan bercacat.
  2: Uji yang sama: dua pertanyaan planner memunculkan '?', satu terjawab masih ada, semua terjawab hilang; pertanyaan sesi lain dan tiket cancel tidak dihitung. Tanpa baris say('?') uji gagal.
  3: Uji 'tickets that become todo...' lulus: lima tiket satu pekerjaan dan dua jalan, lalu berjejer menurut urutan antrean, juga setelah antrean diubah.
  4: Uji yang sama: blocked_by dan solo di papan sungguhan menunggu, jeda tidak; baris belakang, maju dan mundur sesuai keadaan. Dengan waitSlots diganti queueSlots uji gagal.
  5: cast.js memuat Naval Architect untuk planner dan daftar di main.js dibuat dari nama itu; uji dan grep saya tidak menemukan draughtsman di viewer/. Tampilan layar dinilai dengan membaca: repo tidak punya peramban tanpa layar.
  6: Uji demo lulus (idle, reading, asking, reading, idle; rombongan; tiket maju) dan gagal bila pertanyaan demo dimatikan. galangan-padanan.md punya bagian 'Perencana dan meja todo' dengan batas 8. Halaman ?demo tidak dibuka di peramban.
  7: (owner) M1 berisi langkah dari awal (k2 view, /space?demo) sampai apa yang harus terlihat.
  note: Tidak ada AGENTS.md; CLAUDE.md tidak menawarkan pemeriksaan selain perintah uji. Versi plugin tetap 0.17.0: urusan rilis. Tindak lanjut F1: k2 test memecah argumen berisi spasi atau |.

## Follow-ups
- F1 [ticketed] k2 test menjalankan perintah sesudah -- lewat sh tanpa menjaga kutipan argumen: 'k2 test <id> -- node --test --test-name-pattern="the architect reads|tickets that become todo" tests/viewer.test.mjs' gagal dengan 'sh: the: command not found' dan 'sh: tickets: command not found', exit 127, karena spasi dan | di dalam satu argumen dipecah oleh shell. Yang diharapkan: tiap argumen sesudah -- sampai ke perintah persis seperti diberikan (spasi, |, tanda kutip), dengan uji yang memakai pola nama uji berisi spasi dan |.
  → 261113205401
