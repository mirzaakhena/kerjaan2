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

## 5. Saat pengerja ragu

| Jenis keraguan | Yang dilakukan pengerja | Akibatnya |
|---|---|---|
| Bisa dibatalkan dengan murah | `k2 assume`: asumsi, alasannya, dan cara membatalkannya; lalu lanjut | Lencana "≈ asumsi" di kartu sampai pemilik melihatnya |
| Tak bisa dibatalkan, atau mengubah arah produk (hapus data, biaya, mengubah perilaku yang sudah dipakai) | `k2 ask --blocking`; berhenti | **Hanya tiket itu** yang menunggu; tiket lain jalan terus |
| Tidak menahan pekerjaan | `k2 ask`; lanjut | Muncul di kotak masuk |

Asumsi punya tiga keadaan: `unseen` → `confirmed` atau `overturned`. Membatalkan
asumsi pada tiket yang sudah `done` otomatis membuat tiket susulan yang
ber-`related` ke tiket asal.

Planner tetap mengumpulkan pertanyaan di depan, tetapi hanya yang berjenis
kedua. Sisanya ia tulis sebagai asumsi rencana.

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
Keluarannya teks pendek; `--json` untuk mesin.

| Kelompok | Perintah |
|---|---|
| Papan | `init` · `new` · `quick` · `ls` · `show` · `move` · `rename` · `cancel` · `status` · `inbox` · `doctor` |
| Antrean | `ready` · `queue` · `next` |
| Kerja | `start` · `brief` · `test` · `submit` · `verdict` · `land` |
| Catatan | `ask` · `answer` · `assume` · `confirm` · `overturn` · `decide` · `check` · `manual` · `handoff` · `followup` · `learn` |
| Viewer | `view` |

- `k2 quick "<permintaan>"` membuat tiket `light` dan langsung memulainya: pengganti mode "tanpa tiket".
- `k2 next` adalah mesin keadaan mandor: ia menjawab langkah berikutnya (kirim pengerja untuk tiket mana, dengan model dan prompt apa; lanjutkan agen yang mana; tanyakan apa ke pemilik).
- Yang tidak dibawa dari kerjaan: `repair.sh`, `release.sh` (urusan repo kerjaan sendiri, bukan fitur papan), `ticket-size.sh` dengan `--accept-size`, `--ack-unmerged`, `queue.sh compare`, antrean merge, uji "hanya bahasa Inggris".

## 11. Hooks (adaptor Claude Code)

Empat hook, tidak ada yang berjalan di setiap pemanggilan alat.

| Kejadian | Yang dilakukan | Menggantikan |
|---|---|---|
| `SessionStart` (mulai, lanjut, sesudah ringkas) | Menyuntikkan `k2 status`: yang berjalan, ID agennya, isi kotak masuk | Aturan "awal sesi", `handoff.md`, hook penebak persen konteks |
| `SubagentStart` (agen kerjaan2) | Mencatat agen, sesi, dan letak transkripnya ke `.state/` | Viewer menebak dari transkrip |
| `SubagentStop` (agen kerjaan2) | Menolak berhenti bila pengerja belum `submit` dan belum mencatat pertanyaan menahan; mencatat selesai | Sebagian besar `on-ticket-review.sh` |
| `PostToolUse` pada Agent | Menyuntikkan `k2 next` ke mandor begitu agen melapor | Pengingat "panggil peninjau" |

Karena ID agen tersimpan di disk, mandor yang konteksnya baru diringkas cukup
membaca `k2 status` untuk melanjutkan agen yang sama.

Perlu dibuktikan di Tahap 1: apakah masukan hook pemanggilan alat di dalam
subagen memuat ID agennya (dipakai untuk mengikat agen ke tiket). Bila tidak,
pengikatan dilakukan dari baris pertama laporan agen.

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
├── agents/                 ├ adaptor Claude Code: skill mandor, tiga pembungkus tipis, dua hook
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
