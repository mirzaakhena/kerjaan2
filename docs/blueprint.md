# Cetak biru kerjaan2

Status: **disetujui pemilik, 11 November 2026.** Tahap 1 sedang dibangun.
Tanggal: 11 November 2026.

`kerjaan2` adalah penulisan ulang `kerjaan` dari nol. Yang diwarisi adalah
pelajarannya, bukan kode, format, atau aturannya.

---

## 1. Pelajaran dari kerjaan

Diukur di `nukitu-mockup` (449 tiket selesai) dan dibaca dari repo `kerjaan` 1.18.2.

| # | Yang terjadi di kerjaan | Angka | Jawaban kerjaan2 |
|---|---|---|---|
| 1 | `## Notes` jadi keranjang segala hal, prosa bebas yang lalu diurai skrip | 80% isi tiket, median 9 KB | Catatan bertipe, hanya ditulis CLI (§4) |
| 2 | Commit khusus papan menenggelamkan riwayat git | 1.271 dari 2.023 commit | Satu commit per tiket: commit merge membawa tiketnya (§8) |
| 3 | Pemeriksaan tangan yang ditunda tidak pernah ditagih | 66 butir di 57 tiket `done` | Kotak masuk pemilik (§6) |
| 4 | Saran tindak lanjut terkubur di tiket `done` | ±265 saran, ±74 diputuskan | Kotak masuk pemilik (§6) |
| 5 | Semua tiket lewat upacara yang sama | hanya ±7% pernah ditolak | Tiga jalur menurut risiko (§7) |
| 6 | Mesin paralel paling rumit, paling jarang dipakai | ±2.500 baris, 2–6 tiket | Worktree jadi bawaan; antrean merge dihitung dari keadaan, tanpa berkas dan catatan tersendiri (§8) |
| 7 | Aturan panjang dan tersalin di banyak tempat | anggaran 18.000 kata | Anggaran 6.000 kata; aturan dikirim tepat waktu oleh `k2 brief` (§9) |
| 8 | 12 skrip bash, saling memanggil | ±5.000 baris + 13.000 baris uji | Satu CLI Node tanpa dependensi (§10) |
| 9 | Keadaan penting hanya ada di ingatan mandor (ID agen, pelajaran antartiket), ditambal `handoff.md` dan hook penebak persen konteks | — | Keadaan selalu di disk; tidak ada yang perlu diserahterimakan (§9, §11) |
| 10 | Rantai berhenti seluruhnya saat satu tiket butuh keputusan | — | Asumsi tercatat; hanya tiket itu yang menunggu (§5) |
| 11 | Field yang tidak memutuskan apa pun | `reporter` 92% sama, `assign_to` konstan | Dibuang (§4) |
| 12 | Mode khusus bercabang di semua agen ("tanpa tiket", "merge postponed", "mark it done") | — | Tiket murah dibuat (`k2 quick`), jadi mode khusus hilang |

Yang **dipertahankan** karena terbukti: status adalah folder; satu fakta di satu
tempat; mandor tidak menulis kode; pengerja berkonteks bersih; peninjau
independen yang menjalankan pemeriksaan sendiri; bukti uji bersidik jari;
struktur berbahasa Inggris, prosa dalam bahasa papan.

## 2. Tujuh prinsip

1. **Satu fakta, satu tempat.** Judul dan ID di nama berkas, status di folder, "sudah di-merge" di git.
2. **Manusia menulis kontrak; mesin menulis catatan.** Apa pun yang kelak dibaca skrip ditulis oleh CLI dalam bentuk tetap, tidak pernah diurai dari prosa.
3. **Proses sebanding risiko.** Mengganti kata di tombol tidak membayar harga jalur pembayaran.
4. **Aturan dipaksa alat, bukan ingatan.** Gerbang di CLI dan hook; teks aturan pendek.
5. **Yang menunggu manusia tidak boleh hilang.** Semuanya muncul di satu kotak masuk sampai tuntas.
6. **Keadaan ada di disk, bukan di konteks agen.** Sesi boleh diringkas atau diganti kapan saja.
7. **Inti netral.** Format papan, CLI, dan teks peran tidak tahu apa-apa tentang Claude Code; plugin hanyalah adaptor.

## 3. Struktur folder

```
<repo>/
├── .kerjaan2/
│   ├── settings.yml        bahasa, perintah uji, jalur, model, batas
│   ├── backlog/            gagasan, belum siap
│   ├── todo/               siap dikerjakan
│   ├── in_progress/        sedang dikerjakan (punya worktree)
│   ├── review/             menunggu peninjau, atau sudah lolos dan menunggu merge
│   ├── done/               sudah masuk main
│   ├── cancel/             dibatalkan, dengan alasannya
│   ├── log/<id>.jsonl      jejak mesin per tiket; tidak pernah pindah folder
│   ├── queue.yml           urutan antrean; ditulis CLI
│   ├── lessons.md          pelajaran proyek antartiket; dibatasi ukurannya
│   └── .state/             keadaan sementara (kunci, agen berjalan, kemajuan uji); diabaikan git
└── .worktrees/
    └── <id>-<judul-pendek>/     satu worktree per tiket yang berjalan; diabaikan git
```

- Enam nama status tetap seperti `kerjaan`: sudah dikenal dan terbukti cukup.
- `.worktrees/` dan `.kerjaan2/.state/` didaftarkan ke `.git/info/exclude` oleh `k2 init`, jadi `.gitignore` proyek tidak disentuh.
- Papan hanya hidup di pohon utama. Setiap worktree dibuat tanpa `.kerjaan2/` (sparse checkout), dan `k2` selalu menemukan papan utama dari mana pun ia dipanggil. Aturan kerjaan "perintah papan dari pohon utama, uji dari worktree" hilang.

## 4. Penamaan dan isi tiket

### Nama

| Benda | Bentuk | Contoh |
|---|---|---|
| Berkas tiket | `<id> <judul>.md` | `261111141501 Ulasan mitra tampil per halaman.md` |
| Jejak mesin | `log/<id>.jsonl` | `log/261111141501.jsonl` |
| Worktree | `.worktrees/<id>-<judul-pendek>/` | `.worktrees/261111141501-ulasan-mitra-tampil-per/` |
| Cabang | `k2/<id>-<judul-pendek>` | `k2/261111141501-ulasan-mitra-tampil-per` |

- **ID: waktu pembuatan, `yymmddhhmmxx`** (keputusan pemilik): menit pembuatan ditambah nomor urut dua digit. Tahan bentrok antarmesin dan urut menurut waktu. `k2 new` memilihnya di bawah kunci, dan setiap perintah juga menerima beberapa digit terakhirnya bila tidak ambigu.
- Judul pendek dibuat CLI dari empat kata pertama. Agen tidak pernah menyusun jalur sendiri: semua perintah menerima ID saja.

### Isi berkas tiket

Satu berkas, dua zona. Zona atas adalah **kontrak**, ditulis manusia atau mandor,
dan beku setelah tiket masuk `todo`. Zona bawah adalah **catatan**, hanya
ditulis `k2`.

```markdown
---
type: feature            # bug | feature | task
priority: medium         # high | medium | low
lane: standard           # light | standard | strict  (§7)
labels: [dashboard]
blocked_by: []
related: [0398]
touches: [dashboard2/js/, test/wilayah/]   # perkiraan, boleh kosong
created: 2026-11-11 14:15
---

## Background
## How to reproduce        (hanya bug)
## Request
## Done when
- [ ] Ulasan tampil lima per halaman, dibagi oleh server
- [ ] (owner) Rupa halaman di HP sungguhan
## Out of scope            (opsional: yang sengaja tidak dikerjakan)

<!-- k2: di bawah ini ditulis k2, jangan disunting tangan -->

## Questions
- Q1 [answered] Cari di log: di server atau dibuang? Saran: dibuang. → Dibuang. (mirza, 11 Nov)

## Assumptions
- A1 [unseen] Halaman kosong menampilkan "Belum ada ulasan", bukan disembunyikan.
  Mengapa: mengikuti halaman lain. Bila salah: ubah satu teks di `ulasan.js`.

## Decisions
- Saringan dikerjakan server, karena daftar berhalaman.

## Manual checks
- M1 [waiting] Rupa di HP (butir 2): 1) … 2) … Harus terlihat: …

## Handoff
Yang berubah, mengapa, dan apa yang tidak boleh rusak. Maksimal ±150 kata.

## Review
- 2026-11-11 standard, putaran 1, a1b2c3d: lolos. Butir 1: uji X merah saat …

## Follow-ups
- F1 [open] Ekspor berjalan tanpa batas waktu.
```

Perubahan terhadap kerjaan:

| Dibuang | Sebabnya |
|---|---|
| `reporter`, `assign_to` | Nyaris konstan; tidak memutuskan apa pun |
| `updated`, `## History` | Ada di `log/<id>.jsonl` dan git |
| `review` | Diganti `lane`, yang juga menentukan model dan gerbang |
| `## Notes` | Dipecah menjadi tujuh bagian bertipe di atas |

| Baru | Gunanya |
|---|---|
| `lane` | Seberapa berat proses tiket ini |
| `touches` | Perkiraan berkas, kini field, bukan kalimat di Notes; hanya saran untuk urutan |
| `(owner)` di butir `Done when` | Butir yang hanya bisa diperiksa manusia; otomatis jadi `Manual checks` |
| `## Out of scope` | Mengurangi tebakan dan pelebaran kerja |
| `## Assumptions` | Permintaan pemilik: bagian khusus, tampil sebagai lencana di viewer |
| `## Handoff` | Bahan utama saat konflik merge dan saat pengerja diganti |

Aturan zona catatan:

- Bagian kosong tidak ditulis sama sekali.
- Setiap entri satu sampai tiga baris, dengan nomor (`Q1`, `A1`, `M1`, `F1`) dan status dalam kurung siku. CLI menolak entri yang terlalu panjang.
- Tinjauan yang lolos paling banyak satu baris per butir. Keluaran perintah tidak pernah masuk tiket.
- Kontrak tetap ditulis untuk pembaca awam (tanpa nama berkas). Nama berkas dan fungsi boleh di zona catatan: itu memang untuk pelaksana.

### Jejak mesin (`log/<id>.jsonl`)

Satu baris JSON per kejadian: perpindahan status (waktu, sesi), agen mulai dan
selesai (peran, model, ID agen), jalan uji (perintah, lama, sidik jari isi),
sinkron dan merge (commit), putaran tinjauan. Manusia tidak membacanya; viewer
menggambarnya sebagai linimasa dan `k2` memakainya untuk gerbang.

## 5. Saat ragu: antrean tidak pernah menunggu pemilik

`todo` adalah ruang tunggu: tiket masuk ke sana hanya bila tidak ada lagi yang
perlu ditanyakan. Karena itu **planner menutup semua celah di depan**, selagi
pemilik masih ada: setiap titik terbuka (dua tafsir, pilihan alternatif, batas
yang tidak disebut, kasus galat yang tidak dijelaskan) menjadi pertanyaan, dan
tiket tidak bisa masuk `todo` sebelum semuanya dijawab.

Pertanyaan baru tetap bisa muncul saat membangun. Pengerja tidak pernah
berhenti menunggu (keputusan pemilik, 12 November 2026):

| Jenis keraguan | Yang dilakukan pengerja | Akibatnya |
|---|---|---|
| Murah dibatalkan | `k2 assume`: asumsi, alasannya, cara membatalkannya; lanjut | Lencana "≈ asumsi" sampai pemilik melihatnya |
| Tak bisa dibatalkan, atau mengubah arah produk | `k2 ask --blocking`, lalu **membangun pilihan yang ia sarankan** | Tiket ditinjau seperti biasa, lalu **ditahan sebelum merge**. Setuju (`--agrees`): langsung masuk antrean merge. Tidak (`--differs`): kembali ke pengerja |
| Tidak mengubah apa yang dibangun | `k2 ask`; lanjut | Muncul di kotak masuk |

Tiket yang ditahan keluar dari antrean merge, jadi tidak menghalangi tiket
lain; hanya tiket yang `blocked_by` kepadanya yang ikut menunggu. Mandor tidak
pernah membuka pertanyaan selagi masih ada agen yang bekerja: baris `OWNER`
dari `k2 next` dikumpulkan dan diajukan saat antrean diam.

Asumsi punya tiga keadaan: `unseen` → `confirmed` atau `overturned`.

**Yang tidak boleh berjalan berdampingan** juga diputuskan planner:

| Hubungan | Tanda | Akibat |
|---|---|---|
| Butuh hasil tiket lain | `blocked_by` | Mulai setelah tiket itu masuk main |
| Pekerjaan fondasi (struktur data, antarmuka bersama, ganti nama lintas berkas) | `solo: true` | Berjalan sendirian; tidak ada yang mulai di sampingnya atau menyalipnya |
| Hanya menyentuh berkas yang sama | — | Paralel; antrean merge yang membereskan |

## 6. Kotak masuk pemilik

Tidak ada berkasnya: `k2 inbox` menghitungnya dari papan dan git setiap kali
dipanggil, jadi tidak bisa basi.

| Isi | Asal | Tuntas ketika |
|---|---|---|
| Pertanyaan terbuka | `## Questions` | dijawab |
| Asumsi belum dilihat | `## Assumptions` | dikonfirmasi atau dibatalkan |
| Pemeriksaan tangan | `## Manual checks` | pemilik menyatakan lulus atau gagal |
| Merge tertahan | tiket lolos yang `k2 land`-nya ditahan | sebabnya dibereskan, lalu merge |
| Saran tindak lanjut | `## Follow-ups` | dijadikan tiket atau ditolak |
| Ditolak dua kali | jejak mesin | pemilik memutuskan |
| Macet | tiket `in_progress` tanpa agen hidup, worktree yatim | dilanjutkan atau dibersihkan |

Pemilik menuntaskannya lewat percakapan ("konfirmasi semua asumsi 1501", "cek
tangan 398 lulus"); mandor memanggil `k2`. Viewer menampilkan kotak masuk yang
sama, hanya-baca.

## 7. Tiga jalur

| | `light` | `standard` | `strict` |
|---|---|---|---|
| Untuk | teks, tampilan, perubahan kecil yang mudah dibatalkan | pekerjaan biasa | uang, login, izin, data tak tergantikan |
| Pengerja | model hemat | model sesi | model sesi |
| Uji penuh hijau pada isi yang diserahkan | ya | ya | ya |
| Peninjau terpisah | tidak; gerbang mekanis `k2 submit` | ya | ya |
| Tiap butir dibuktikan dengan menjalankan sesuatu | pengerja | peninjau | peninjau |
| Sabotase: uji dibuktikan bisa merah | tidak | tidak | pengerja dan peninjau |
| Salinan bersih untuk meninjau | tidak | tidak | ya |

- **Siapa memilih.** Planner mengusulkan dari apa yang akan diubah, dengan alasannya; pemilik bisa menimpa per tiket.
- **Naik otomatis, tidak pernah turun.** Saat `k2 submit`, CLI membandingkan perubahan nyata dengan `strict_paths` dan `light_max_files` di settings. Tiket `light` yang ternyata menyentuh jalur berisiko atau terlalu lebar naik jalur sendiri dan mendapat peninjau.
- **Gerbang mekanis `light`.** Uji hijau pada sidik jari yang sama dengan isi cabang, setiap butir punya bukti, `Handoff` terisi, tidak ada pertanyaan menahan.
- Sabotase wajib bagi pengerja di setiap tiket (seperti di kerjaan) dihapus: itu sumber waktu terbesar, dan kini hanya dibayar di `strict`.

## 8. Kerja paralel: worktree sebagai bawaan

Setiap tiket dikerjakan di worktree-nya sendiri, juga saat hanya satu yang
berjalan. Jadi hanya ada satu cara kerja.

```
k2 start <id>    todo → in_progress; buat .worktrees/<id>-…/ dan cabang k2/<id>-… dari main;
                  jalankan worktree_setup
   pengerja bekerja dan commit di cabangnya
k2 submit <id>   tarik main ke cabang → uji keadaan tergabung → gerbang → review (jalur light: langsung bertanda lolos)
   peninjau menilai keadaan tergabung itu
k2 verdict pass   tetap di review, bertanda lolos
k2 land <id>     masuk main → done; hapus worktree dan cabang
```

**Yang selesai duluan langsung masuk main.** Tidak menunggu tiket lain. Konflik
jadi kecil dan muncul saat konteks pengerjanya masih hangat.

**Antrean merge dengan kunci giliran** (keputusan pemilik, 12 November 2026).
Tiket masuk antrean saat lolos, urut menurut waktu lolos. Hanya tiket terdepan
yang boleh digabung; `k2 land` pada tiket lain menjawab `WAITING` dengan
nomor antreannya dan tidak mengubah apa pun. Tiket terdepan memegang
gilirannya sampai masuk main, juga selama konfliknya dibereskan pengerja dan
dilihat peninjau, sehingga main tidak bergerak di bawahnya dan satu tiket
disesuaikan paling banyak sekali. Giliran lepas pada tiga keadaan: tiket masuk
main; merge-nya ditahan untuk pemilik (ia keluar antrean, dan masuk lagi di
belakang setelah dibereskan); atau penyelesaian konfliknya ditolak peninjau
(pindah ke belakang). Antrean dihitung dari keadaan di disk, jadi tidak ada
berkas kunci yang bisa basi; `k2 status` menampilkannya.

Yang terjadi saat giliran tiba:

| Keadaan saat giliran tiba | Yang terjadi | Biaya agen |
|---|---|---|
| main tidak berubah sejak `submit` | langsung merge | nol |
| main berubah, gabung bersih | CLI menggabung, menjalankan uji sendiri, lalu merge | nol |
| gabung bersih tetapi uji merah | kembali ke pengerja, mode integrasi | pengerja |
| konflik | kembali ke pengerja, mode integrasi | pengerja + peninjau (hanya bagian konflik) |

**`done` berarti sudah masuk main.** Tiket yang lolos tetap di `review`
bertanda **lolos, belum di-merge** sampai `k2 land` berhasil, juga selama
integrasi. Integrasi bukan penolakan dan tidak menambah putaran.

(Temuan uji coba: tanpa giliran, satu tiket dibawa mutakhir dua kali karena
disalip tiket lain.)

**Siapa menyelesaikan konflik.** Pengerja tiket yang masuk belakangan,
dilanjutkan dari konteksnya sendiri. `k2 brief --mode integrate` memberinya
daftar berkas yang bentrok dan `## Handoff` dari setiap tiket yang masuk main
sejak cabangnya dibuat dan menyentuh berkas itu. Bila itu belum cukup, ia
menulis pertanyaannya dalam laporan; mandor melanjutkan pengerja tiket
seberang, lalu meneruskan jawabannya.

- Tidak ada agen merge-resolver tersendiri. Bila pengerja asli tidak bisa dilanjutkan, pengerja baru dikirim dengan mode integrasi yang sama.
- Pesan langsung antar-subagen memang ada di Claude Code, tetapi "agent teams" masih eksperimental. Lewat mandor adalah jalur yang stabil dan tercatat; pesan langsung bisa ditambahkan kelak tanpa mengubah rancangan.

**Urutan dan batas.**

- `queue.yml` hanya daftar ID berurutan, satu baris tujuan, dan tanda jeda opsional. Tata bahasa `order.md`, grup, dan baris lands-first hilang.
- Yang boleh berjalan bersamaan: tiket teratas yang `blocked_by`-nya sudah masuk main, sampai `max_parallel` (bawaan 3).
- `touches` hanya saran: planner menjauhkan dua tiket yang perkiraannya bertumpuk berat, tetapi tidak melarangnya.

**Uji di worktree berbeda.** Tiap worktree mendapat `K2_SLOT` dan `K2_TICKET`
untuk menamai port dan basis datanya. Bawaannya uji bergiliran lewat satu
kunci; `parallel_tests: true` melepasnya.

**Worktree yatim.** `k2 land` menghapus worktree dan cabang begitu merge
berhasil. `k2 doctor` melaporkan worktree tanpa tiket hidup, tiket hidup tanpa
worktree, cabang `k2/*` yang sudah di-merge, dan kunci basi; `--fix`
membereskan yang aman.

**Commit.** Commit merge ke main membawa serta berkas tiket (pindah ke `done`)
dan jejaknya, jadi satu tiket adalah satu commit di main, ditambah commit
kerja di cabangnya. Perpindahan selagi berjalan tidak di-commit. Perubahan
papan tanpa kode (tiket baru, antrean) di-commit sekali per penyusunan antrean.

## 9. Agen

Tetap tiga, ditambah mandor. Tidak ada agen baru: setiap peran tambahan yang
saya timbang ternyata lebih murah sebagai *mode* dari peran yang ada.

| Peran | Tugas | Yang berubah dari kerjaan |
|---|---|---|
| **mandor** (sesi utama) | Bicara dengan pemilik, menjalankan apa yang dikatakan `k2 next` | Tidak lagi menyimpan keadaan di ingatan; panduan 400 baris diganti keluaran `k2 next` |
| **planner** | Membaca backlog, memecah tiket besar, mengisi `touches` dan `lane`, menyusun antrean | Hanya menanyakan yang benar-benar menahan; merapikan `lessons.md` |
| **worker** | Satu tiket di worktree-nya sampai `k2 submit`; juga mode perbaikan dan integrasi | Satu perintah serah-terima menggantikan lima langkah |
| **reviewer** | Menilai butir demi butir, lalu `k2 verdict` | Hanya di `standard` dan `strict` |

**Aturan dikirim tepat waktu.** Definisi tiap agen hanya belasan baris: jalankan
`k2 brief <id> --role <peran>` dan ikuti. `brief` mencetak kontrak tiket,
catatan yang relevan, pelajaran proyek yang cocok, dan langkah untuk **keadaan
ini saja** (jalur, putaran, mode). Pengerja tiket `light` tidak pernah membaca
aturan sabotase; peninjau putaran pertama tidak membaca aturan putaran kedua.

**Pelajaran antartiket** pindah dari ingatan mandor ke `lessons.md`: jebakan,
konvensi, pola penolakan. Pengerja dan peninjau menambah lewat `k2 learn`;
berkasnya dibatasi ±60 baris.

**Model per peran**, bisa ditimpa di `settings.yml`:

| | Bawaan |
|---|---|
| worker `light` | `sonnet` |
| worker `standard`, `strict` | model sesi |
| reviewer, planner | model sesi |

**Anggaran teks aturan: 6.000 kata** untuk skill dan semua peran, dijaga oleh uji.

## 10. Satu CLI: `k2`

Node 18+, tanpa dependensi, tersedia di PATH lewat folder `bin/` plugin.
Keluarannya teks pendek.

| Kelompok | Perintah |
|---|---|
| Papan | `init` · `new` · `quick` · `ls` · `show` · `move` · `rename` · `cancel` · `status` · `inbox` · `doctor` |
| Antrean | `ready` · `queue` · `next` |
| Kerja | `start` · `brief` · `test` · `submit` · `verdict` · `land` |
| Catatan | `ask` · `answer` · `assume` · `confirm` · `overturn` · `decide` · `check` · `manual` · `handoff` · `followup` · `learn` |
| Viewer | `view` |

- `k2 quick "<permintaan>"` membuat tiket `light` dan langsung memulainya: pengganti mode "tanpa tiket".
- `k2 next` adalah mesin keadaan mandor: ia menjawab langkah berikutnya (kirim pengerja untuk tiket mana, dengan model dan prompt apa; lanjutkan agen yang mana; tanyakan apa ke pemilik).
- Yang tidak dibawa dari kerjaan: `repair.sh`, `release.sh` (urusan repo kerjaan sendiri, bukan fitur papan), `ticket-size.sh` dengan `--accept-size`, `--ack-unmerged`, `queue.sh compare`, catatan antrean merge di tiket, uji "hanya bahasa Inggris".

## 11. Hooks (adaptor Claude Code)

Empat hook. Penjaga peran berjalan di setiap pemanggilan Bash, tetapi hanya memulai Node bila pemanggilnya subagen; tiga lainnya tidak berjalan per pemanggilan alat.

| Kejadian | Yang dilakukan | Menggantikan |
|---|---|---|
| `SessionStart` (mulai, lanjut, sesudah ringkas) | Menyuntikkan apa yang sedang berjalan dan apa yang menunggu pemilik | Aturan "awal sesi", `handoff.md`, hook penebak persen konteks |
| `PostToolUse` pada `Agent` dan `SendMessage` | Mencatat ID agen ke tiketnya begitu agen dikirim atau dilanjutkan. Planner tidak terikat satu tiket: ia dicatat di keadaan lokal papan (`.state/planner.json`: siapa, sejak kapan, di mana transkripnya), dan dihidupkan lagi saat dilanjutkan dengan pesan | Mandor yang harus ingat `k2 agent`; mencegah pengerja kedua masuk worktree yang sama |
| `PreToolUse` pada `Bash` | **Penjaga peran**: menitipkan peran agen ke setiap perintah shell yang dijalankan subagen kerjaan2 (`export K2_ROLE=...;` di depan perintah); `k2` sendiri lalu menolak, dari argumennya yang sebenarnya, perintah yang bukan hak peran itu | Gerbang yang sebelumnya hanya berbasis kepercayaan |
| `SubagentStop` (pengerja dan planner kerjaan2) | Menolak sekali bila pengerja belum menyerahkan; bila ia tetap berakhir, menandainya di papan sehingga `k2 next` mengirim lagi. Planner yang berhenti tidak ditahan: catatannya di papan diakhiri | Sebagian besar `on-ticket-review.sh` |

Karena ID agen tersimpan di disk, mandor yang konteksnya baru diringkas cukup
membaca `k2 status` untuk melanjutkan agen yang sama. Menjalankan `k2 next`
setelah laporan agen tetap aturan mandor, bukan hook.

Belum terbukti di sesi sungguhan: apakah `agent_id` pada `SubagentStop` sama
dengan ID yang dikembalikan alat `Agent`, dan apakah keempat hook menyala. Dokumentasi Claude Code menyatakan
masukan hook di dalam subagen memuat `agent_id` dan `agent_type`; penjaga
peran bergantung pada itu.
Semua hook diuji dengan masukan tiruan.

## 12. Viewer

Hanya-baca, satu server untuk semua proyek, mengikuti papan secara langsung,
terang dan gelap, pas di HP, `--lan` untuk jaringan.

Tiga tab per proyek:

1. **Ruang kendali** (halaman utama)
   - *Menunggu Anda*: kotak masuk §6, dengan jumlah per jenis.
   - *Sedang berjalan*: satu kartu per agen (tiket, peran, model, jalur, langkah terakhir, lama, kemajuan uji, worktree).
   - *Antrean*: urutan berikutnya dan apa yang menahan tiap tiket.
   - *Selesai hari ini*, dan kesehatan worktree (aktif, yatim).
2. **Papan**: kanban enam kolom. Lencana di kartu: `≈` asumsi belum dilihat, `✋` cek tangan menunggu, `⚠` lolos tetapi belum di-merge (di kolom review), `?` pertanyaan terbuka.
3. **Riwayat**: tiket selesai per hari, lama pengerjaan, tingkat penolakan, sebaran jalur.

Laci tiket: Kontrak, Catatan, Linimasa (dari jejak mesin).

Kegiatan agen dibaca dari transkrip yang letaknya dicatat hook, bukan ditebak.
Rupa viewer diajukan sebagai mockup untuk disetujui di awal Tahap 3.

## 13. Susunan repo dan kenetralan

```
kerjaan2/
├── bin/k2                  pintu CLI; masuk PATH saat plugin aktif
├── core/                   papan, tiket, jejak, git, uji, land, inbox, doctor, brief   ← netral
├── roles/                  teks peran yang dicetak `k2 brief`                          ← netral
├── viewer/                 (Tahap 3)                                                   ← netral
├── skills/kerjaan2/        ┐
├── agents/                 ├ adaptor Claude Code: skill mandor, tiga pembungkus tipis, empat hook
├── hooks/                  ┘
├── .claude-plugin/
├── docs/                   cetak biru ini
└── tests/
```

Adaptor Claude Code tetap di folder baku plugin (`skills/`, `agents/`, `hooks/`)
agar terpasang tanpa konfigurasi tambahan; yang netral adalah `core/` dan
`roles/`.

Agen lain kelak cukup diberi adaptor: cara memanggil subagen dan cara
menyuntikkan `k2 status`. Format, CLI, dan teks peran tidak berubah.

Skill, teks peran, CLI, dan viewer berbahasa Inggris; prosa tiket mengikuti
`language` di settings.

## 14. Tahapan

| Tahap | Isi | Dicoba dengan |
|---|---|---|
| 1. Inti | Format, `k2` (papan, catatan, `start`/`submit`/`verdict`/`land` untuk satu tiket), skill, tiga agen, empat hook, tiga jalur | Beberapa tiket nyata, satu per satu, di satu proyek |
| 2. Paralel | Beberapa tiket bersamaan, mode integrasi, slot uji, `doctor`, kotak masuk lengkap | Satu batch 3–4 tiket yang sengaja bertumpuk berkas |
| 3. Viewer | Mockup → Ruang kendali, Papan, Riwayat | Memantau batch Tahap 2 dari HP |

Tiap tahap berakhir dengan hasil coba dan daftar yang diubah sebelum tahap
berikutnya.

### Keputusan pemilik (11 November 2026)

1. Cetak biru disetujui; dibangun bertahap.
2. ID tiket berbentuk waktu, `yymmddhhmmxx`.
3. Tahap 1 dicoba di proyek baru, `k2-akunting`, agar tidak mengganggu proyek yang ada.

### Keputusan pemilik sesudah uji coba (12 November 2026)

4. `done` berarti sudah masuk main; tiket yang lolos menunggu merge di `review`.
5. Riwayat tiket cukup di jejak mesin, dibaca lewat `k2 history <id>` dan kelak linimasa viewer; tidak ada `## History` di berkas tiket.
6. `.kerjaan2/` ikut di-commit; hanya `.state/` dan `.worktrees/` yang diabaikan git.

### Perbandingan aturan agen dengan kerjaan (12 November 2026)

Aturan agen `kerjaan` dibandingkan satu per satu dengan `kerjaan2`. Keputusan
pemilik atas hasilnya:

7. Peninjau menolak tiket karena: butir `Done when` tidak terpenuhi, bug nyata
   di kode yang diubah, atau pelanggaran aturan proyek. (Di `kerjaan` hanya
   yang pertama.) Konsekuensi yang diterima: penolakan lebih sering.
8. Butir `(owner)` selalu ditunda; tidak ada pilihan menahan antrean.
   Konsekuensi: kode yang belum dilihat pemilik bisa sudah di main.
9. Antrean hanya punya tanda jeda; `chain: group | ticket` tidak dibawa.
10. Tinjauan `standard` membuktikan setiap butir dengan menjalankan sesuatu,
    seperti `normal` di `kerjaan`.
11. Aturan yang sempat hilang dipulihkan: membatalkan butir (`k2 void`), jalan
    uji agen lewat kunci uji (`k2 test <id> -- <perintah>`), agen tidak
    memanggil agen lain, jalur menentukan titik mulai dan bukan kesimpulan,
    penolakan ditulis lengkap, laporan pengerja memuat yang tidak dibuktikan
    dengan menjalankan, peninjau membaca aturan proyek dan tidak mengarang
    perintah, alur "tandai selesai", planner tidak menyunting tiket berjalan.
12. Menyusul di Tahap 3: keterangan pada setiap perintah Bash agen, untuk viewer.

Yang sengaja tidak dibawa dan konsekuensinya: sabotase oleh pengerja di setiap
tiket (hanya `strict`; uji yang tidak bisa gagal lebih mungkin lolos di
`standard`), peninjau untuk perubahan kecil (jalur `light` tanpa mata kedua),
perbandingan perkiraan berkas dengan hasil nyata (planner tidak belajar dari
perkiraan yang meleset).

### Jaminan saat merge (12 November 2026)

**Yang masuk main selalu persis isi yang ujinya lulus.** `k2 land` memaksa ini,
bukan mengandaikannya:

1. Cabang tiket harus sudah memuat seluruh main; kalau main bergerak, main
   ditarik dulu ke cabang.
2. Ujung cabang itu harus punya jalan uji yang lulus pada sidik jari isi yang
   sama persis. Kalau tidak ada (main baru ditarik, ada commit sesudah lolos,
   atau tiket diterima pemilik tanpa tinjauan), uji dijalankan saat itu. Merah
   berarti tidak ada yang digabung dan tiket kembali ke pengerjanya.
3. Sesudah digabung tetapi sebelum di-commit, isi yang akan masuk main
   dibandingkan dengan sidik jari yang diuji. Berbeda berarti merge dibatalkan
   dan ditahan.
4. Antrean merge dan kunci `land` menjamin main tidak bergerak di antara
   langkah-langkah itu.

Peninjau bekerja di worktree tiketnya dan tidak boleh meninggalkan apa pun:
`k2 verdict` menolak bila worktree berubah selama tinjauan atau cabangnya
bergerak sejak diserahkan.

Batas jaminan ini: hanya sejauh `test_command` menguji; proyek tanpa
`test_command` tidak punya jaminan; uji yang kadang lulus kadang gagal bisa
meloloskan; berkas yang diabaikan git (paket terpasang, `.env`) bisa berbeda
antara worktree dan pohon utama; dan commit yang dibuat langsung di main di
luar `k2` tidak diuji siapa pun.

### Sisa panduan kerjaan (12 November 2026)

Empat panduan `kerjaan` yang belum dibaca (tinjauan, kerja paralel, pengaturan,
perbaikan) dibandingkan juga. Keputusan pemilik: paket perbaikan kecil diambil.

- Planner: "kriteria dulu, jalur kemudian".
- `k2 start` melepas kunci papan selama `worktree_setup`; setup yang gagal
  mengembalikan tiket ke `todo`.
- Pengetahuan tentang `test_command`, giliran uji, dan kepemilikan data uji
  masuk README; variabel `K2_WORKTREE` ditambahkan.
- `k2 accept` meminta tiket susulan untuk temuan yang tersisa.
- Tiket keputusan punya butir untuk tempat keputusan itu berakhir.
- `k2 ls --session <id>` menggantikan kebiasaan label `sesi-<id8>`.
- Kebiasaan "aturan baru menyebut aturan yang digantikannya".

Tidak diambil sekarang, dengan konsekuensinya:

- **Letak worktree yang bisa diatur.** Worktree tetap di `.worktrees/` dalam
  repo, berlawanan dengan pelajaran `kerjaan` ("di samping repo"). Teruji aman
  untuk `node --test` dan ripgrep; `grep -r` menelusurinya; Jest, Vitest,
  ESLint, dan Flutter belum diuji. Proyek yang alatnya menelusuri folder itu
  harus mengecualikannya di konfigurasi alatnya sendiri.
- **Batas jalur untuk proyek mock.** Jalur tetap bisa naik sendiri di papan
  mana pun.
- **Uji pemicu skill.** Deskripsi skill belum pernah diukur.

### Tinjauan independen atas 0.9.0 (12 November 2026)

Satu agen peninjau independen memeriksa 0.9.0 dan menemukan dua puluh cacat.
Semuanya diperbaiki di 0.10.0 atas keputusan pemilik. Yang mengubah rancangan:

- **`k2 land` transaksional.** Commit merge yang gagal membatalkan semua
  langkahnya; tiket tetap di `review` dan ditahan. Merge milik pemilik yang
  sedang terbuka di pohon utama tidak pernah disentuh.
- **Hanya isi yang dinilai yang masuk main.** Ujung cabang harus commit yang
  dinilai peninjau (atau yang lolos gerbang, di jalur `light`). Commit sesudah
  itu mengembalikan tiket ke pengerjanya untuk diserahkan ulang. Apa pun yang
  diubah pengerja saat membawa main masuk dilihat peninjau, di jalur mana pun.
- **Agen yang menghilang tidak memacetkan tiket.** `k2 next` menyebutnya
  `STUCK` setelah `stuck_after_minutes`; `k2 release` membebaskan langkahnya;
  `--stopped` menyerahkan tiket kepada pemilik.
- **Tiket yang hanya menunggu pemilik tidak memakai jatah** `max_parallel` dan
  tidak menahan tiket `solo`.
- **Kontrak dibekukan saat mulai.** `Request` dan `Done when` yang berubah di
  tengah jalan ditolak sampai pemilik mengesahkannya dengan `k2 amend`.
- **Gerbang diperketat:** putusan hanya dari peninjau yang dikirim untuk
  langkah itu; lolos butuh satu catatan per butir; `k2 void` wajib menyebut
  pertanyaan yang sudah dijawab dan menaikkan jalur `light` ke `standard`;
  setiap penolakan sesudah yang kedua diajukan lagi kepada pemilik.
- **Ketahanan:** satu berkas tiket rusak tidak mematikan papan; pengaturan
  divalidasi; berkas sisa uji ditoleransi; kunci uji bertahan selama jalan
  ujinya hidup; penulisan keadaan di bawah kunci.

Yang tetap berbasis kepercayaan, dengan sadar: bukti pada `k2 check`, baris
"Red-proof" di jalur `strict` (peninjau `strict` merusak ulang sendiri), dan
kebenaran ID agen yang dicatat. CLI tidak bisa mengenali siapa pemanggilnya.

### Pemeriksaan ulang atas 0.10.0 (12 November 2026)

Peninjau yang sama memeriksa ulang. Dari 19 temuan pertama: 9 teratasi, 10
teratasi sebagian; dan perbaikan 0.10.0 sendiri memasukkan cacat baru. Yang
diubah di 0.11.0:

- **Berkas tak terlacak tidak pernah ditebak sebagai "sisa uji".** Aturan
  artefak di 0.10.0 bisa menyembunyikan berkas sumber yang lupa di-commit,
  sehingga main menjadi merah. Sekarang berkas tak terlacak selalu menghentikan
  serah-terima; proyek yang ujinya meninggalkan berkas harus mengabaikannya
  lewat `.gitignore`.
- **Setiap kali tiket kembali, langkahnya baru.** Peninjau yang dikirim untuk
  langkah sebelumnya tidak lagi dihitung, sehingga putusan tidak bisa
  diberikan atas isi yang belum ia lihat.
- **Segel kontrak mencakup seluruh kontrak**, termasuk tanda batal; centang
  hanya dihitung bila dibuat `k2 check`.
- **Jalur hanya turun atas kata pemilik** (`k2 set ... --force`).
- **Tiket yang berhenti di depan antrean merge menepi.**
- **Kontrak yang berubah saat ditinjau** muncul di papan untuk pemilik;
  `k2 amend` mengembalikan tiket ke pengerjanya.
- Commit merge berjalan di luar kunci papan; hook pencatat agen membaca tiket
  dari "Ticket <id>" dan ID agen dari kolom jawabannya.

**Yang tetap berbasis kepercayaan, dan batasnya.** CLI tidak tahu siapa
pemanggilnya. Seorang pengerja yang melanggar instruksinya masih bisa
menjalankan perintah milik pemilik atau mandor: `k2 amend`, `k2 answer` atas
pertanyaannya sendiri, `k2 agent <id> reviewer <apa saja>` lalu `k2 verdict`,
`k2 set ... --force`, `k2 accept`. Gerbang-gerbang itu menahan kekeliruan,
bukan kesengajaan. Penegakan yang sungguh-sungguh hanya mungkin di luar CLI
(hook yang menolak perintah itu bila dipanggil dari dalam subagen), dan itu
belum dibangun.

### Penjaga peran (keputusan pemilik, 12 November 2026)

Dibangun di 0.12.0 sebagai hook `PreToolUse`. Daftar perintah per peran ada di
`core/cmd-hook.mjs` (`MAY`): pengerja hanya menulis catatan tiketnya dan
`submit`; peninjau hanya `verdict`, `followup`, dan `learn`; planner hanya
menyiapkan antrean; subagen lain hanya membaca; sesi utama tidak dibatasi.

Batasnya: hanya berlaku di Claude Code dengan plugin terpasang; hanya melihat
perintah yang memanggil `k2` lewat alat Bash (agen yang sengaja menyunting
berkas papan langsung, atau memanggil `node core/run.mjs`, tidak tertangkap);
dan belum terbukti di sesi sungguhan.

### Putaran ketiga dan rancang ulang penjaga peran (12 November 2026)

Peninjau menemukan penjaga peran 0.12.0, yang mengurai baris perintah shell,
dilewati bentuk shell biasa (jalur berkutip, `bash -c`, `--force=1`) dan salah
menolak teks yang sekadar menyebut sebuah perintah. Keputusan pemilik: rancang
ulang. Di 0.13.0 hook tidak mengurai apa pun: ia menitipkan peran ke lingkungan
perintah, dan `k2` memutuskan dari argumennya sendiri (`core/roles.mjs`).

Yang juga diperbaiki: commit merge kembali di bawah kunci papan (di 0.11.0 ia
dipindah keluar, sehingga tiket terhitung `done` sebelum commit-nya ada dan
tiket yang bergantung padanya bisa mulai terlalu dini); `k2 void` menolak
menyegel suntingan tangan; pesan untuk berkas tak terlacak menyebut dua jalan
(commit bila dibutuhkan kode atau uji, `.gitignore` bila hanya keluaran) dan
tidak lagi saling bertentangan; segel kontrak hanya mencakup `Request`,
`Done when`, dan `Out of scope`.

Batas penjaga peran yang tersisa, dengan sadar:

- Agen yang sengaja mengosongkan `K2_ROLE`, menyunting berkas papan langsung,
  atau memanggil subagen umum untuk menjalankan `k2`, tidak tertahan.
- Tidak ada pemeriksaan bahwa agen itu memang yang ditugaskan pada tiket itu:
  belum terbukti bahwa ID agen di hook sama dengan ID dari alat `Agent`.
- **Belum terbukti di sesi sungguhan**, dan ada satu risiko yang hanya terlihat
  di sana: awalan `export ...;` bisa membuat Claude Code meminta izin untuk
  perintah yang sebelumnya lolos otomatis. Bila itu terjadi, `role_guard: false`
  di `settings.yml` mematikan penjaga tanpa mencabut plugin.

### Putaran keempat: sesi sungguhan dan 0.13.0 (12 November 2026)

**Terbukti di sesi sungguhan** (tiga tiket di `k2-akunting`): hook pencatat
agen menyala; hook penjaga peran menyala di semua 87 perintah shell subagen
tanpa permintaan izin; ID agen di hook sama dengan ID dari alat `Agent`;
planner bertanya di depan, menandai tiket struktur data `solo`, dan memberi
`blocked_by`; merge mengikuti urutan lolos.

**Belum terbukti:** bahwa Claude Code benar-benar menjalankan perintah yang
sudah diubah hook (dokumentasinya menyebut perubahan tanpa keputusan izin bisa
dibuang di mode auto); hook awal sesi; hook berhenti; jalur tolak, macet, dan
merge tertahan; uji lambat.

Diperbaiki di 0.14.0: tanda kotak masuk ke dalam segel kontrak; `k2` menemukan
papan dari folder mana pun di dalam subagen (`K2_HOME`), sehingga peninjau
tidak lagi menabrak galat dari salinannya; kotak masuk menampilkan semua
langkah pemeriksaan tangan; perintah uji tidak mewarisi peran agen; perintah
yang menunggu papan mengatakannya; pengerja dan peninjau hanya menulis ke
tiket yang ditugaskan kepadanya; jejak tiket mencatat peran dan agen pemanggil,
yang sekaligus menjadi bukti apakah penjaga peran berpengaruh.

### Tahap 3: viewer (12 November 2026)

Keputusan pemilik sebelum dan selama mockup:

13. Antarmuka viewer berbahasa Inggris, sesuai §13. Prosa tiket tetap tampil
    dalam bahasa papan.
14. Kegiatan agen dibaca dari transkrip, dengan cadangan jejak tiket bila
    transkrip tidak ada. Karena itu aturan yang ditunda di keputusan no. 12
    kini masuk `roles/worker.md` dan `roles/reviewer.md`: setiap perintah Bash
    diberi `description` dalam bahasa papan. Aturan ini tidak menggantikan
    aturan lain; ia aturan baru yang sudah dijanjikan.
15. Laporan uji satu per satu (protokol `KERJAAN_TEST_REPORT` di `kerjaan`)
    tidak dibawa. Viewer menampilkan lama uji berjalan, lama sejak keluaran
    terakhir (hijau, kuning setelah semenit, merah setelah lima menit), dan
    ekor keluaran mentahnya.
16. Rupa: gaya sederhana viewer `kerjaan` lama (panel navy, huruf IBM Plex
    Sans Condensed, satu warna per status, terang dan gelap mengikuti sistem),
    dengan tambahan. Lima mockup diperlihatkan; dua yang bertema (barak
    militer hiperrealistis dan HUD futuristik) disukai pemilik dan disimpan di
    `docs/mockups/` untuk kelak menjadi pilihan tema. Tema belum dibangun.
17. Halaman memenuhi layar dan tidak digulir; hanya isi panel yang menggulir.
    Di bawah lebar 1100 piksel halaman kembali menggulir biasa, satu kolom.
18. "Today" dari sketsa awal (selesai hari ini, worktree, giliran uji) pindah
    ke bilah atas sebagai angka kecil, supaya kolom kanan Ruang kendali cukup
    untuk antrean merge dan antrean berikutnya.

Yang dibangun di 0.15.0:

- `k2 view [--port 4322] [--root <folder>] [--lan]` (sejak 0.17.0 juga
  `--depth`, lihat bagian terakhir). Tanpa `--root`, yang
  dipindai adalah folder tempat repo ini berada, sehingga proyek tetangganya
  ikut tampil. Papan baru muncul tanpa restart.
- `viewer/server.mjs` hanya melayani GET, tidak pernah mengambil kunci papan,
  dan tidak menulis apa pun. Tanpa `--lan` ia hanya menjawab di `127.0.0.1`
  dan menolak permintaan dengan nama host lain. `--lan` mencetak alamat
  jaringan dan peringatan bahwa tidak ada kata sandi.
- Yang ditampilkan dihitung dengan modul `core/` yang sama dengan `k2`
  (`inboxItems`, `badges`, `mergeQueue`, `orderedTodo`, `readiness`,
  `occupying`, `stuckFor`). Yang dihitung di halaman sendiri (teks alasan
  antrean, arti baris jejak) tetap bisa menyimpang; tinjauan 0.15.0 menemukan
  tiga tempat seperti itu. Logika worktree yatim dipindah
  dari `doctor` ke `strayWorktrees`, dipakai keduanya.
- Halaman mengikuti papan lewat satu sambungan `text/event-stream`: server
  membandingkan sidik berkas papan tiap detik dan memberi tahu halaman.
- **Letak transkrip dicatat hook yang sudah ada**, bukan hook `SubagentStart`
  baru seperti rencana di §12 dan di serah-terima. Hook pencatat agen
  (`PostToolUse` pada `Agent` dan `SendMessage`) menerima `transcript_path`
  sesi; transkrip subagen ada di sampingnya, di
  `<sesi>/subagents/agent-<id>.jsonl`. Letak itu disimpan di keadaan tiket
  (`worker.transcript`, `reviewer.transcript`). Tata letak ini dilihat pada
  sesi sungguhan `k2-akunting`, tetapi **belum terbukti dari ujung ke ujung**:
  belum ada sesi sungguhan yang berjalan dengan hook 0.15.0.
- Jalan uji meninggalkan `.state/progress/<id>.pid` selama berjalan, supaya
  viewer bisa membedakan uji yang sedang jalan dari keluaran uji yang gagal.

Batas yang diketahui:

- Viewer membaca seluruh papan setiap kali papan berubah. Itu cepat pada 16
  tiket (`k2-akunting`); pada ratusan tiket belum diukur.
- Kolom `done` menampilkan 60 tiket terbaru, sisanya lewat tombol.
- `k2 test <id> -- <perintah>` (jalan uji agen sendiri) tidak meninggalkan
  penanda, jadi tidak tampil sebagai uji berjalan.
- Keluaran uji dan perintah agen bisa memuat rahasia; dengan `--lan` itu
  terbaca oleh siapa pun di jaringan.
- Dengan `parallel_tests: true` tidak ada kunci uji, jadi "test turn" selalu
  `free` walau uji berjalan.

### Tinjauan independen atas 0.15.0 (12 November 2026)

Satu agen peninjau independen memeriksa viewer 0.15.0: tidak ada temuan yang
menghalangi, sembilan yang sebaiknya diperbaiki, dua belas catatan. Keputusan
pemilik: kesembilan temuan dan catatan yang murah diperbaiki di 0.15.1; dengan
`--lan`, viewer hanya menjawab di bawah alamat dan nama mesin ini.

Yang diperbaiki di 0.15.1:

- **Agen macet sampai ke halaman.** Jam ikut dalam sidik papan (`stuckFor`),
  jadi halaman diberi tahu walau tidak ada berkas yang berubah.
- **Viewer tidak lagi menyentuh indeks git.** Pemeriksaan worktree yatim
  memakai `git --no-optional-locks status`.
- **`k2 doctor` kembali melaporkan tautan putus di `.worktrees/`**, tidak
  berhenti dengan galat (regresi 0.15.0).
- **Halaman pulih sendiri** ketika papan yang tadinya tidak terbaca menjadi
  terbaca lagi, dan diberi tahu ketika folder proyek hilang.
- **Arti baris jejak** dipindah ke `viewer/web/trail.js` dan diuji terhadap
  bentuk yang ditulis `core/`: putusan atas integrasi tidak lagi tampil
  "round undefined", alasan merge ditahan dan sebab integrasi tampil.
- **Jeda yang sudah dilepas `k2 go`** tidak lagi ditampilkan sebagai jeda.
- **Satu pengawas per papan**, dipakai bersama oleh semua halaman yang
  mengikutinya, dan git tidak lagi dipanggil tiap detik.
- **`--lan`** menolak nama host yang bukan alamat atau nama mesin ini.
- Catatan: "running" (agen yang bekerja) dan "places" (tiket yang memakai
  tempat, seperti hitungan `k2 next`) kini dua angka; antrean merge hanya
  menyebut agen sedang membawa main masuk bila memang ada agennya; transkrip
  berbentuk tak terduga tidak lagi membuat halaman galat; `--port ""` dan
  argumen tak dikenal ditolak; `HEAD` pada aliran peristiwa selesai; perubahan
  yang tiba selagi halaman memuat tidak hilang; agen yang dicatat ulang dengan
  tangan tetap menyimpan letak transkripnya; `nextActions` tidak lagi dihitung
  untuk halaman yang tidak memakainya.

Uji: setiap temuan ditulis ujinya lebih dulu dan terlihat gagal. Sembilan
mutasi peninjau yang tadinya lolos, ditambah tiga mutasi atas perbaikan baru,
dijalankan pada salinan repo: kedua belasnya kini tertangkap. Satu dari
sembilan mutasi peninjau (pemeriksaan bentuk ID tiket dihapus) tidak diuji:
tiket dicari dengan kecocokan persis, jadi mutasi itu tidak mengubah perilaku.

Batas yang tetap, dengan sadar:

- Panggilan alat yang barisnya lebih dari 256 KB di transkrip tidak terbaca;
  kartu agen jatuh ke jejak tiket sampai panggilan berikutnya.
- Folder proyek yang berupa symlink tidak didaftar.
- Riwayat dan "landed today" memakai zona waktu browser, linimasa memakai
  teks waktu server; keduanya berbeda hanya bila zonanya berbeda.
- Penanda uji berjalan (`.pid`) yang basi dan nomornya kebetulan dipakai
  proses lain akan tampil sebagai uji berjalan; `k2 doctor` belum
  membersihkan folder `progress/`.
- Belum diperiksa siapa pun: halaman di browser sungguhan sesudah perbaikan
  ini, Node 18, hook di sesi Claude Code nyata (termasuk `transcript_path`
  pada `SendMessage`), dan `--lan` dari perangkat kedua.

## Rel ikon di laci tiket (0.15.2)

Diminta pemilik 12 November 2026: di laci tiket, deretan ikon di kiri seperti
activity bar VS Code; satu klik membawa isi ke section-nya. Keputusan pemilik:

- Rel ada di tab **Record** dan **Contract** (Timeline tidak).
- Section yang kosong tidak mendapat ikon, sama seperti section-nya yang tidak
  dirender.
- Angka biru di pojok ikon menghitung entri yang masih terbuka (unseen, open,
  blocking, waiting), sama dengan hitungan "N open" di tab Record. Contract
  tidak punya angka.
- Ikon yang menyala mengikuti posisi gulir; section yang baru diklik tetap
  menyala sampai pembaca menggulir sendiri, supaya section terakhir yang
  pendek tetap bisa ditandai.

Ikon berupa SVG garis buatan sendiri di `app.js`, tanpa pustaka.

## Galangan: ruang kerja 3D (fondasi, 13 November 2026)

Diminta pemilik 12 November 2026: papan yang sama ditampilkan sebagai ruang
kerja 3D dengan karakter yang bekerja, berpikir, berjalan, bingung, dan
menerima pesanan; kamera gaya isometrik yang bisa di-zoom, diputar, dan
mengikuti satu karakter. Gerakannya tidak harus persis mengikuti kejadian
sebenarnya dan boleh tertunda; semua dianggap dikerjakan dengan tangan supaya
terlihat sibuk. Pemerannya boleh lebih dari tiga peran agen.

Keputusan pemilik:

19. **Tema: galangan kapal di pelabuhan kecil.** Yang ditolak: dapur restoran,
    pabrik, pertanian. Rupanya low-poly bergaya, bukan fotorealistis.
20. **Bentuk 3D dari paket aset CC0**, ikut disimpan di repo seperti font.
21. **Cara kerja: fondasinya dikerjakan langsung, sisanya lewat tiket** di papan
    kerjaan2 milik repo ini sendiri, pada sesi baru, setelah rupa fondasi
    disetujui pemilik. (Papan itu belum dibuat.)

22. **Keputusan no. 21 diubah pemilik pada malam yang sama.** Setelah melihat
    fondasinya ("sudah OK banget"), pemilik meminta sisanya diselesaikan malam
    itu tanpa ditunggui. Jalur tiket butuh pemilik (memasang plugin di repo ini
    dan membuka sesi baru), jadi sisanya dikerjakan langsung di sesi yang sama.
    Tafsiran ini milik agen, bukan kata-kata pemilik: bila pemilik tetap ingin
    papan kerjaan2 untuk repo ini, itu belum dibuat.
23. Diminta pemilik saat melihat fondasi: derek tidak boleh bersinggungan
    dengan mercusuar; daftar pemeran bukan deretan tombol bulat yang
    ter-wrap, melainkan (diputuskan agen atas izin pemilik) daftar tegak di
    sisi kiri dengan wajah, nama, dan kegiatan tiap karakter.

Padanan papan ke galangan, seperti yang dibangun:

| Di kerjaan2 | Di galangan |
|---|---|
| tiket pertama kali terlihat selagi halaman terbuka | perahu pos merapat, kurir membawa pesanan ke rak |
| backlog | gulungan di rak ORDERS (12 tempat) |
| backlog → todo | juru gambar mengambil gulungan, menggambar, memasangnya di papan |
| todo | gulungan di papan QUEUE, menurut urutan antrean (8 tempat) |
| todo → in_progress | mandor membawa gulungan ke dok kosong; lunas diletakkan |
| in_progress, review | kapal di satu dari empat dok; ukuran kapal dari jumlah kriteria |
| agen worker sedang bekerja | tukang dok itu memalu; keterangannya langkah terakhir agen dari transkrip |
| kriteria terpenuhi | lambung makin tinggi (juga merayap naik selama agen bekerja) |
| uji berjalan | lampu di tiang dok: hijau, kuning setelah semenit tanpa keluaran, merah setelah lima |
| agen macet | tukang atau inspektur menggeleng, balon "?" |
| pertanyaan menunggu pemilik | tukang duduk menunggu dengan balon "?" |
| agen reviewer sedang bekerja | inspektur berkeliling lambung itu |
| ditolak | inspektur memberi "✗"; lambung turun lagi |
| lulus | inspektur memberi "✓"; layar dan bendera dipasang |
| giliran pertama di antrean merge | operator derek bersiap meluncurkan kapal itu |
| landed (done) | kapal meluncur ke air dan berlabuh; empat kapal terbaru tinggal, yang tertua berlayar pergi |
| cancel | lambung dibongkar tukangnya, atau gulungannya dibawa kurir ke tumpukan kayu |
| kotak masuk pemilik berisi | bendera di dekat mercusuar (satu per butir, paling banyak lima); penjaga memberi isyarat |

Aturan yang dipegang: galangan boleh tertinggal dari papan, tidak pernah
mendahuluinya. Tiap tiket dibawa selangkah demi selangkah ke tempat yang
disebut papan; bila seorang pemeran sudah ditunggu tiga pekerjaan, tokennya
langsung diletakkan tanpa cerita. Tiket yang mundur (misalnya dari todo ke
backlog) juga langsung diletakkan. Di luar itu para pemeran mengerjakan
pekerjaan kecil yang tidak menyebut tiket apa pun, supaya galangan tetap hidup
ketika papan sepi.

Yang dibangun (0.16.0):

- Halaman `/p/<proyek>/space`, dengan tautan "Shipyard" di bilah atas. Hanya
  GET. Model dan three.js boleh disimpan browser sehari; yang lain tetap
  `no-store`.
- `viewer/web/space/`: `plan.js` (arti papan di galangan; murni, diuji di
  Node), `director.js` (token tiap tiket, dok, jangkar, dan koreografi tiap
  langkah), `cast.js` (sepuluh pemeran: pekerjaan dari sutradara, lalu tugas
  menurut papan, lalu pekerjaan kecil), `actor.js` (satu karakter), `world.js`
  (pelabuhan, kapal yang tumbuh dari lunas, rute jalan), `main.js` (kamera,
  daftar pemeran, kartu tiket, sambungan ke papan), `faces.js` (wajah tiap
  pemeran, digambar sekali), `demo.js` (papan karangan).
- Klik seorang pemeran atau barisnya di daftar kiri untuk mengikutinya; klik
  kapal atau gulungan untuk kartu tiketnya, dengan tautan ke laci tiket.
- `?demo`: papan karangan di dalam halaman, untuk menonton galangan ketika
  papan asli sepi. Halaman menyebut dengan jelas bahwa itu demo.
- three.js 0.170.0 (MIT) di `viewer/web/space/three/`; model dari tiga paket
  Kenney (CC0: Mini Characters, Pirate Kit, Watercraft Kit) di
  `viewer/web/space/kits/` beserta lisensinya, hanya berkas yang dimuat
  (dijaga uji). Seluruh folder sekitar 4,8 MB. CLI tetap tanpa dependensi.

Batas, dengan sadar:

- Empat dok. Tiket kelima yang sedang berjalan menunggu sebagai gulungan di
  papan antrean sampai ada dok kosong.
- Rak memuat 12 gulungan dan papan antrean 8; sisanya tidak digambar (jumlah
  di bilah atas tetap benar).
- Kapal tidak mengingat doknya antar-muat-ulang: saat halaman dibuka, tiap
  tiket langsung diletakkan di tempatnya tanpa cerita.
- Planner tidak terlihat bekerja sebelum tiket pindah ke todo: papan tidak
  mencatat kapan planner sedang berjalan.
- Karakter berjalan menurut lajur dan satu jalan; mereka bisa saling menembus.
- Lambung yang "merayap naik" selama agen bekerja adalah hiasan, bukan ukuran
  kemajuan; yang terukur hanya kriteria yang terpenuhi.

Yang dilihat berjalan, semuanya di Chrome tanpa kepala (1512×860; lebar 430
hanya untuk fondasi):

- mode demo: seluruh siklus, termasuk peluncuran, kartu tiket, bendera;
- papan sungguhan (papan sementara yang digerakkan `k2`): tiket baru datang
  lewat perahu pos, `start` membawa tiket ke dok dan tukangnya bekerja begitu
  `k2 agent` mencatat worker, `land` meluncurkan kapalnya.

Belum dilihat: browser sungguhan dengan tetikus, HP sungguhan, Safari, mesin
tanpa GPU, sesi kerjaan2 sungguhan (langkah agen dari transkrip asli, uji
berjalan, penolakan, agen macet, pertanyaan), dan papan besar.

### Dua tinjauan independen atas galangan (13 November 2026)

Tinjauan pertama (fondasi): tidak ada yang menghalangi, delapan yang sebaiknya
diperbaiki. Diperbaiki: uji daftar model kini mencakup semua model dan menolak
berkas yang tidak dimuat; barang yang dibawa berbagi satu geometri; sambungan
yang putus dibaca ulang dan dikatakan di halaman; fokus papan ketik tidak
hilang saat memilih pemeran; lengan tidak lagi terulur tanpa barang; pos kerja
dan barang digeser dari lajur jalan; empat belas model tak terpakai dibuang;
model dan three.js boleh disimpan browser. Juga label kanvas, `aria-live`,
petunjuk sentuh, dan bingkai kamera yang dihitung ulang saat layar diputar.

Tinjauan kedua (papan menggerakkan galangan): satu yang menghalangi, empat yang
sebaiknya diperbaiki; semuanya diperbaiki dan diberi uji, dan lima mutasi atas
perbaikannya tertangkap:

- **Dua tiket yang mulai bersamaan bisa mendapat dok nomor −1** dan kapalnya
  tak terlihat. Dok kini diambil saat itu juga.
- Tiket yang hilang dari satu pembacaan papan tidak lagi dilupakan lalu datang
  ulang sebagai pesanan baru; ia dilupakan setelah empat detik tidak ada.
- Tiket yang selesai tanpa pernah mendapat dok langsung berlabuh, tidak
  merebut dok dari yang sedang dikerjakan.
- Inspektur menggilir semua kapal yang punya reviewer.
- `director.js` tidak lagi mengimpor adegan, sehingga diuji di Node dengan
  galangan dan pemeran tiruan.

Yang dibiarkan, dengan sadar: rak dan papan antrean yang penuh tidak memberi
tanda ada lebihnya; kapal yang sudah berlayar pergi tidak kembali bila tiket
selesai terbaru dibuka lagi; vonis yang jatuh selagi tokennya sedang dibawa
tidak ditampilkan; peta bayangan digambar ulang tiap bingkai. Lambung yang
merayap naik selama agen bekerja melebihi yang dikatakan papan; peninjau
menyerahkannya kepada pemilik untuk diputuskan.

## Viewer mencari papan lebih dalam (0.17.0)

Diminta pemilik: `k2 view` hanya menemukan papan satu tingkat di bawah
`--root`; ia ingin kedalaman bisa diatur, paling banyak tiga tingkat, dan
`.gitignore` dihormati.

- `k2 view --depth <1|2|3>`. Tanpa `--depth` tetap satu tingkat, seperti
  sebelumnya. Nilai lain ditolak dengan pesan.
- Folder yang diabaikan git tidak menjadi proyek. Yang ditanya adalah git
  sendiri (`git check-ignore`), sekali untuk tiap repositori yang melingkupi
  folder berpapan itu, jadi semua aturan git berlaku (`.gitignore` bertingkat,
  `.git/info/exclude`, pengecualian global). Repositori di atas `--root` tidak
  ditanya. `.gitignore` di folder yang bukan repositori tidak berarti apa-apa,
  sama seperti bagi git.
- Folder tersembunyi dan `node_modules` tidak dimasuki; symlink tidak diikuti.
- Nama proyek tetap nama foldernya, karena nama itulah alamat halamannya. Dua
  folder bernama sama: yang paling dekat dengan `--root` yang tampil, yang lain
  tidak. Kartu di halaman depan menampilkan letak proyek yang lebih dalam.
- Pencarian tiga tingkat di folder kerja pemilik memakan sekitar 70 ms, maka
  server mengingat letak papan yang sudah ditemukan dan baru mencari lagi bila
  papan itu hilang; daftar papan di halaman depan selalu mencari ulang.

## Galangan memutar linimasa (tiket 261113190702)

Keputusan pemilik 24 dan 33 (`docs/galangan-tahap2.md`) mengganti dua hal dari
bagian "Galangan" di atas:

- Galangan tidak lagi membandingkan keadaan papan dari satu pembacaan ke
  pembacaan berikutnya. Ia memutar linimasa tiap tiket: tiap kejadian satu
  adegan, berurutan per tiket, dengan jamnya sendiri. Sampai 30 detik
  tertinggal adegan diputar biasa; lebih dari itu dipercepat sampai 4 kali;
  lebih dari 5 menit tertinggal galangan langsung diletakkan di keadaan
  sekarang tanpa cerita (jawaban pemilik atas Q1 tiket itu). Halaman yang baru
  dibuka tetap mulai dari keadaan sekarang.
- Lambung tidak lagi merayap naik selama agen bekerja. Ia bergerak hanya
  ketika kriteria terpenuhi, dicabut, atau dibatalkan.

Kejadian yang belum punya adegan di 0.16.0 dilewati, dan tiket yang mundur
tetap langsung diletakkan (Q2 dan Q4). Rinciannya, beserta batasnya, ada di
`docs/galangan-padanan.md` bagian "Linimasa".

## Perencana dan meja todo di galangan (tiket 261113190704)

Keputusan pemilik 26 (`docs/galangan-tahap2.md`) mengganti dua baris padanan
di bagian "Galangan" di atas (backlog → todo, dan todo):

- Juru gambar (Draughtsman) menjadi Naval Architect, dengan karakter yang
  sama. Selama papan mencatat planner bekerja ia membaca di papan pesanan;
  selama ada pertanyaan planner yang menunggu pemilik ia memakai "?", dan di
  antara dua giliran planner ia tetap di papan pesanan, diam, sampai semuanya
  terjawab (Q1). Adegan menggambar di meja DRAWINGS dibuang; meja itu tinggal
  tempatnya saat senggang (Q4).
- Papan QUEUE diganti meja todo. Tiket yang pindah ke todo hampir bersamaan
  dibawa dalam satu jalan (Q3) dan berjejer menurut urutan antrean: 8 di baris
  depan, 8 di baris belakang, sisanya tidak digambar (Q5). Baris belakang
  untuk tiket yang menunggu tiket lain (`blocked_by` belum landed, atau
  karena tiket solo); tiket yang dijeda pemilik tetap di depan (Q2).

Rinciannya, beserta batasnya, ada di `docs/galangan-padanan.md` bagian
"Perencana dan meja todo".
