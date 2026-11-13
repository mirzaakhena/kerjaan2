---
type: feature
priority: medium
lane: standard
labels: []
blocked_by: []
related: [261113190704]
touches: [core/cmd-hook.mjs, hooks/hooks.json, core/board.mjs, viewer/snapshot.mjs, tests/k2.test.mjs, tests/viewer.test.mjs]
created: 2026-11-13 19:12
---

## Background

Worker dan reviewer dicatat papan pada saat mereka dikirim (hook `agent-sent`
di `core/cmd-hook.mjs`), sehingga viewer tahu siapa yang sedang bekerja.
Planner dikenali hook yang sama tetapi tidak dicatat, dan ia tidak terikat
pada satu tiket: ia membaca seluruh backlog. Akibatnya viewer tidak bisa
memperlihatkan bahwa planner sedang bekerja, hanya hasilnya. Planner bekerja
dua kali: sekali untuk usulan, lalu dilanjutkan (dikirimi pesan) setelah
pemilik menjawab.

Tiket ini dipecah dari "Perencana terlihat bekerja dan meja todo"
(261113190704): di sini hanya catatannya di papan dan jalan viewer untuk
membacanya; adegan di galangan ada di tiket itu. Bagian dari galangan tahap 2
(keputusan 26 di `docs/galangan-tahap2.md`).

Yang perlu diingat: plugin yang berjalan di sesi adalah salinan terpasang,
bukan sumber di repo ini. Hook yang diubah di sini baru berjalan di sesi
sungguhan setelah `/plugin update kerjaan2` dan sesi baru.

## Request

Papan mencatat saat planner dikirim, saat ia dilanjutkan, dan saat ia selesai,
tanpa terikat pada satu tiket, dan viewer memperlihatkan bahwa planner sedang
bekerja.

## Done when

- [x] Saat planner dikirim, papan mencatat bahwa planner sedang bekerja dan sejak kapan, tanpa menyebut satu tiket; mandor tidak perlu menjalankan perintah apa pun untuk itu.
- [x] Saat planner itu berhenti, catatannya berakhir; saat ia dilanjutkan dengan pesan, catatannya hidup lagi.
- [x] Keadaan papan yang dibaca halaman viewer menyebut apakah planner sedang bekerja dan sejak kapan, dan Control room memperlihatkannya sebagai kartu "planner" dengan langkah terakhirnya dari transkrip.
- [x] Planner yang tidak pernah tercatat selesai (misalnya sesi ditutup di tengah jalan) tidak tampil bekerja selamanya: sesudah `stuck_after_minutes` ia tidak lagi dianggap bekerja.
- [x] Mengirim worker atau reviewer tercatat seperti sebelumnya, dan mengirim agen lain yang bukan milik kerjaan2 tidak mencatat apa pun.
- [x] Hook tidak pernah menggagalkan sesi: papan yang tidak ada, tidak terbaca, atau sedang terkunci dilewati dengan diam.
- [x] Viewer tetap hanya membaca: catatan ini ditulis oleh hook, bukan oleh viewer.
- [ ] (owner) Di sesi kerjaan2 sungguhan, sesudah `/plugin update kerjaan2` dan sesi baru, planner yang dikirim tampil sedang bekerja di viewer dan hilang begitu ia selesai.

## Out of scope

Adegan di galangan (si perencana, meja todo): tiket 261113190704. Mencatat
kegiatan mandor (sesi utama).

<!-- k2:record — written by k2 only; do not edit by hand -->

## Questions
- Q1 [answered] Di mana pemilik bisa melihat planner bekerja sebelum adegan galangannya ada? (a) Control room di viewer mendapat kartu 'planner' (sejak kapan, dan langkah terakhirnya dari transkrip seperti worker dan reviewer); (b) hanya ada di data keadaan untuk galangan, belum tampil di mana pun. Saran: (a), supaya tiket ini bisa dicoba sendiri; bila (b), baris (owner) di tiket ini dipindah ke tiket 261113190704.
  → Pemilik: "Semua ikut saran (Recommended)". Jadi (a): Control room di viewer mendapat kartu 'planner' (sejak kapan, dan langkah terakhirnya dari transkrip seperti worker dan reviewer). (owner, 2026-11-13)
- Q2 [answered] Catatan planner disimpan di mana? (a) di keadaan lokal papan (seperti catatan worker dan reviewer; tidak ikut commit, tidak masuk linimasa tiket); (b) juga sebagai log tingkat papan yang ikut di-commit, supaya riwayat planning bisa dibaca kemudian. Saran: (a): cukup untuk galangan dan tidak menambah berkas yang berubah di tiap sesi.
  → Pemilik: "Semua ikut saran (Recommended)". Jadi (a): catatan planner disimpan di keadaan lokal papan, seperti catatan worker dan reviewer; tidak ikut commit, tidak masuk linimasa tiket. (owner, 2026-11-13)
- Q3 [answered] Dua planner tercatat sekaligus (mandor mengirim planner baru selagi yang lama belum tercatat selesai): (a) yang terbaru menggantikan yang lama, viewer hanya memperlihatkan satu planner; (b) semuanya dicatat. Saran: (a): papan hanya punya satu perencana.
  → Pemilik: "Semua ikut saran (Recommended)". Jadi (a): planner terbaru menggantikan yang lama; viewer hanya memperlihatkan satu planner. (owner, 2026-11-13)

## Assumptions
- A1 [unseen] Planner yang tidak tercatat selesai dianggap berhenti bekerja setelah stuck_after_minutes tanpa tanda hidup: dihitung dari yang paling baru di antara saat ia dikirim/dilanjutkan dan langkah terakhir di transkripnya, bukan dari saat dikirim saja.
  Why: Sesi yang ditutup di tengah jalan tidak lagi menambah langkah, jadi ia tetap hilang; tetapi planning panjang yang masih berjalan tidak ikut hilang dari viewer.
  If wrong: Di plannerAtWork (viewer/snapshot.mjs) pakai p.at saja sebagai titik hitung.
- A2 [unseen] Kartu planner ikut dihitung di angka 'running' dan 'at work' Control room, tetapi tidak memakan tempat (places) dan tidak masuk hitungan kartu proyek di halaman daftar.
  Why: Planner memang agen yang sedang bekerja, tetapi max_parallel hanya tentang tiket.
  If wrong: Hapus tambahan satu di dua tempat di viewer/web/app.js.

## Decisions
- Lane standard: mengubah hook dan inti (catatan baru di papan), dengan uji; tidak menyangkut izin atau data yang tak bisa dipulihkan. Tidak menunggu apa pun: tidak menyentuh galangan.
- Planner yang dijalankan di latar depan baru dilaporkan 'terkirim' sesudah ia kembali (PostToolUse), jadi hook mencatatnya langsung sebagai selesai: lewat status 'completed' pada jawaban alat, atau karena berhentinya sudah terlihat lebih dulu (ID yang berhenti diingat di catatan). Hanya planner latar belakang yang tampil bekerja sejak dikirim; yang latar depan baru tampil bila dilanjutkan dengan pesan.
- Berhentinya planner hanya mengakhiri catatan bila ID agennya sama dengan yang tercatat: planner lama yang berhenti terlambat tidak mengakhiri planner baru yang menggantikannya (Q3).

## Manual checks
- M1 [waiting] (item 8) 1. Jalankan /plugin update kerjaan2, lalu buka sesi Claude baru di repo kerjaan2.
  2. Di terminal lain jalankan k2 view dan buka tab Control room proyek ini.
  3. Di sesi, minta mandor mengisi antrean dari backlog (planner dikirim di latar belakang).
  4. Dalam beberapa detik panel Running now memperlihatkan kartu 'planner' (Planning the backlog) dengan jam berjalan dan langkah terakhirnya.
  5. Saat planner selesai melapor, kartu itu hilang.
  6. Jawab pertanyaannya sehingga mandor melanjutkannya dengan pesan: kartu muncul lagi, lalu hilang begitu ia selesai.

## Handoff
Papan kini mencatat planner di .kerjaan2/.state/planner.json (B.getPlanner/setPlanner di core/board.mjs): hook agent-sent menulisnya saat kerjaan2:planner dikirim dan menghidupkannya lagi saat SendMessage menuju agen itu; hook subagent-stop (matcher kini worker|planner) mengakhirinya tanpa menahan planner. viewer/snapshot.mjs membacanya sebagai live.planner (null bila selesai atau tanpa tanda hidup selama stuck_after_minutes) dan Control room menampilkan kartu planner. Jangan rusak: pencatatan worker/reviewer lewat bind, hook yang selalu diam dan keluar 0, viewer yang tidak pernah menulis, dan cabang planner di agentSent yang harus diperiksa sebelum pencarian ID tiket.

## Review
- 2026-11-13 standard, round 1, at d5b8dc8: passed.
  1: Di papan sekali pakai, hook agent-sent untuk kerjaan2:planner (async_launched) menulis .state/planner.json berisi agent, at, transcript, tanpa tiket; tak ada perintah lain. Uji bernama 'the planner is recorded on the board' lulus.
  2: Dijalankan sendiri: subagent-stop menambah ended dan live.planner jadi null; SendMessage ke agen itu menghapus ended dengan at baru dan planner tampil lagi. Planner lama yang berhenti terlambat tidak mengakhiri penggantinya (uji bernama, lulus).
  3: GET /api/p/toko/state memberi live.planner {agent, since, model, step, command, at}; Control room dirender di Chrome tanpa kepala: kartu 'Planning the backlog, planner, Membaca backlog, k2 list backlog', running 1; hilang sesudah berhenti, muncul lagi sesudah dilanjutkan.
  4: Catatan tanpa ended berumur 59 menit masih tampil; uji viewer bernama (lulus) memeriksa di atas batas jadi null, juga dengan stuck_after_minutes 5, dan langkah transkrip baru sebagai tanda hidup (A1).
  5: Uji lama 'an agent is recorded the moment it is sent' lulus dijalankan menurut nama; agen general-purpose tidak menulis apa pun (planner.json tidak ada); uji baru memeriksa worker tetap terikat ke tiketnya dan kerjaan:planner tidak dicatat.
  6: Dijalankan sendiri: hook keluar 0 dengan stdout dan stderr kosong saat kunci state dipegang proses hidup (sekitar 6 detik per hook, catatan tak berubah) dan saat .state tak terbaca (chmod 000); tanpa papan dan settings rusak lewat uji bernama (lulus).
  7: grep panggilan tulis (writeFile, rename, mkdir, rm, setPlanner, setState) di viewer/*.mjs kosong; mtime planner.json tidak berubah oleh pembacaan, viewer tidak membuat berkas itu, POST dijawab 405.
  8: (owner) Manual checks M1 bisa diikuti dari awal dan berakhir pada apa yang harus terlihat.
  note: uji 'the Control room shows the planner as a card of its own' hanya mencocokkan teks sumber app.js; kriteria 3 dibuktikan lewat render Chrome, jadi tidak menahan.
  note: version di .claude-plugin/plugin.json tidak dinaikkan di cabang ini; langkah (owner) butuh /plugin update, jadi rilis sesudah tiket mendarat perlu menaikkannya.
  note: tidak ada pemeriksaan lain di repo selain perintah uji (tanpa CI, tanpa skrip lint); AGENTS.md tidak ada.
