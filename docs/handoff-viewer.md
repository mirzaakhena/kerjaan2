# Serah-terima: Tahap 3, viewer

Ditulis 12 November 2026 untuk sesi baru yang tidak punya ingatan apa pun
tentang proyek ini. Baca `CLAUDE.md` dan `docs/blueprint.md` lebih dulu;
berkas ini hanya memuat keadaan sekarang dan pekerjaan berikutnya.

## Keadaan sekarang

- Versi **0.14.1**, 64 uji lulus, pohon kerja bersih, tidak pernah di-push.
- Tahap 1 (inti) dan Tahap 2 (paralel, antrean merge) selesai dan sudah
  dipakai di sesi sungguhan pada `k2-akunting`: 15 tiket masuk main.
- Empat putaran tinjauan independen sudah dijalankan; temuan dan keputusannya
  ada di bagian akhir `docs/blueprint.md`.

**Terbukti di sesi sungguhan:** hook awal sesi, hook pencatat agen, hook
penjaga peran beserta efeknya (jejak tiket memuat `"by":"worker:<id>"`),
planner yang bertanya di depan dan menandai `solo` / `blocked_by`, merge
menurut urutan lolos, jalur `light`, `standard`, dan `strict`.

**Belum pernah terlewati di sesi sungguhan:** hook berhenti, penolakan oleh
peninjau, pertanyaan di tengah jalan (bangun dengan saran lalu ditahan), agen
macet (`STUCK`, `k2 release`), merge tertahan, penolakan oleh penjaga peran,
uji yang lambat (uji `k2-akunting` hanya 3 detik), dan ringkasan konteks.

**Terbuka, bukan untuk Tahap 3 kecuali pemilik meminta:**

- Belum ada uji konkurensi otomatis selain satu kasus merge.
- Proses `k2` yang dimatikan di tengah jalan uji tidak mencatat apa pun.
- `.worktrees/` di dalam repo belum diuji terhadap Jest, Vitest, ESLint,
  Flutter (perlu sebelum `nukitu-mockup` memakai kerjaan2).
- Deskripsi skill belum pernah diuji pemicunya.
- Agen yang sengaja mengosongkan `K2_ROLE` atau menyunting berkas papan
  langsung tidak tertahan (batas yang diterima; lihat cetak biru).

## Yang diminta pemilik untuk viewer

Dari wawancara awal (kata-katanya: "lebih segar, lebih mudah dipantau, lebih
profesional"):

1. **Hanya-baca.** Viewer tidak mengubah papan. Semua tindakan tetap lewat
   sesi Claude.
2. **Halaman utama proyek = "Ruang kendali"**, bukan kanban. Tata letak yang
   dipilih pemilik:

   ```
   ┌──────────────────────────────────────────────┐
   │ nukitu-mockup        ● 3 berjalan  ▲ 2 perlu Anda │
   ├───────────────────┬──────────────────────────┤
   │ MENUNGGU ANDA     │ SEDANG BERJALAN          │
   │ ? Pertanyaan  (1) │ #2611.. Ulasan mitra     │
   │ ✋ Cek tangan (4) │   pengerja · uji 3m12s   │
   │ ⚠ Merge tahan (0)│ #2611.. Log aktivitas    │
   │ ≈ Asumsi baru (3) │   peninjau · membaca diff│
   ├───────────────────┴──────────────────────────┤
   │ ANTREAN  ①→②→③      SELESAI HARI INI  7      │
   │ worktree: 3 aktif · 0 yatim                  │
   └──────────────────────────────────────────────┘
   [ Ruang kendali ] [ Papan ] [ Riwayat ]
   ```

3. **Tiga tab:** Ruang kendali; Papan (kanban enam kolom); Riwayat (tiket
   selesai per hari, lama pengerjaan, tingkat penolakan, sebaran jalur).
4. **Pertanyaan agen harus terlihat di viewer** begitu dicatat, supaya pemilik
   tahu ada yang menunggunya tanpa membuka terminal.
5. **Asumsi mendapat tempat khusus dan lencana yang mudah terlihat**, terutama
   pada kartu `done`.
6. **Lencana di kartu:** `?` pertanyaan terbuka, `≈` asumsi belum dilihat,
   `✋` cek tangan menunggu, `⚠` lolos tetapi belum di-merge (di kolom review).
7. **Laci tiket:** Kontrak, Catatan, Linimasa (dari jejak mesin).
8. **Worktree terpantau:** mana yang aktif, mana yang yatim.
9. Satu server untuk semua proyek di `~/Workspace`, mengikuti papan secara
   langsung, terang dan gelap, pas di HP, `--lan` untuk jaringan lokal.

**Urutan kerja yang disepakati:** mockup dulu untuk disetujui pemilik, baru
dibangun. Jangan langsung menulis viewer jadi.

**Belum diputuskan, tanyakan kepada pemilik:**

- Bahasa antarmuka viewer. Viewer `kerjaan` berbahasa Inggris; sketsa di atas
  berbahasa Indonesia.
- Apakah kegiatan agen (langkah terakhir, perintah yang sedang jalan) dibaca
  dari transkrip seperti di `kerjaan`, atau cukup dari jejak tiket.
- Apakah laporan uji satu per satu (protokol `KERJAAN_TEST_REPORT` di
  `kerjaan`) dibawa. Saat ini `k2` hanya menyimpan keluaran mentah.

## Dari mana viewer membaca

Jangan mengurai ulang berkas papan: impor modul `core/` yang sudah ada.

| Yang ditampilkan | Sumber |
|---|---|
| Proyek | folder di bawah direktori pindaian yang punya `.kerjaan2/settings.yml` |
| Tiket per status | `B.loadAll(board)` di `core/board.mjs` → `{ tickets, broken }`; tiap tiket punya `id`, `title`, `status`, `file`, `fm`, `contract`, `record` |
| Butir `Done when` | `T.criteria(contract)` di `core/ticket.mjs` → `{ n, done, owner, void, text }` |
| Catatan tiket | `record.questions / assumptions / decisions / manual / handoff / review / followups`; entri berkunci punya `key`, `status`, `text`, `sub[]` |
| Kotak masuk "Menunggu Anda" | `inboxItems(board)` di `core/cmd-board.mjs` |
| Lencana kartu | `badges(board, ticket)` di `core/cmd-board.mjs` |
| Apa yang dilakukan mandor berikutnya | `nextActions(board)` (baris `START`, `DISPATCH`, `WAIT`, `STUCK`, `LAND`, `OWNER`, `FIX`) |
| Antrean `todo` | `orderedTodo(board)`; `B.readQueue(board)` → `{ goal, order, pause }` |
| Antrean merge | `B.mergeQueue(board)`; yang terdepan dengan `st.needs` sedang dibawa mutakhir |
| Keadaan tiket berjalan | `B.getState(board, id)` → `.kerjaan2/.state/tickets/<id>.json` |
| Linimasa | `B.readLog(board, id)` → `.kerjaan2/log/<id>.jsonl` |
| Worktree dan cabang | `B.worktreeOf`, `B.branchOf`; yatim = logika `doctor` di `core/cmd-board.mjs` |
| Keluaran uji yang sedang jalan | `.kerjaan2/.state/progress/<id>.log` (dihapus bila uji lulus) |
| Siapa memegang giliran | folder `.kerjaan2/.state/{board,test,land}.lock/` berisi `pid` dan, untuk uji, `child` |
| Pelajaran proyek | `.kerjaan2/lessons.md` |

**Kolom keadaan tiket** (`.state/tickets/<id>.json`): `mode` (first, fix,
answered, amended, resubmit), `round`, `rejections`, `answers`, `resubmits`,
`slot`, `started`, `submitted`, `passed`, `passedAt`, `judged`, `needs`
(worker atau reviewer: sedang dibawa mutakhir), `integrations`, `conflict`,
`held` (alasan merge ditahan), `stopped`, `stoppedRole`, `go`,
`owner_ok_rejections`, serta `worker` dan `reviewer` berisi
`{ agent, step, at, ended }`.

**Kejadian di jejak** (`event`): created, moved, started, agent, test, check,
uncheck, void, manual, manual-ok, manual-failed, question, answer, assumption,
assumption-confirmed, assumption-overturned, conflict, submitted, verdict,
integrate, integrated, held, landed, accepted, amended, released, retry.
Setiap baris punya `t` (waktu lokal), sering `session` (ID sesi Claude Code),
dan `by` (`peran:idAgen`) bila dibuat dari dalam subagen.

**Kegiatan agen secara langsung:** transkrip subagen ada di
`~/.claude/projects/<folder-proyek>/<session>/subagents/agent-<id>.jsonl`;
`session` dan ID agen ada di jejak tiket. Hook `SubagentStart` yang mencatat
letak transkrip belum dibangun; kalau viewer membutuhkannya, itu pekerjaan
Tahap 3.

**Arti status yang mudah keliru:** `done` berarti sudah masuk main. Tiket yang
lolos tetap di `review` dengan `st.passed === true` sampai `k2 land` berhasil.
Tiket yang hanya menunggu pemilik (`held`, `stopped`, ditolak dua kali) tidak
memakai jatah `max_parallel`.

## Bahan dari viewer kerjaan lama

Kode lama ada di `/Users/mirza/Workspace/kerjaan/viewer/` (server Node tanpa
dependensi, `web/` berisi JS biasa, 16 berkas uji). Boleh dibaca sebagai
acuan; jangan disalin mentah, karena format papannya berbeda. Yang terbukti
berguna di sana dan layak dipertimbangkan:

- satu server memindai banyak proyek; proyek baru muncul tanpa restart;
- halaman mengikuti papan secara langsung, termasuk tiket yang sedang dibuka;
- saringan (jenis, prioritas, label, kata di judul) tersimpan di alamat halaman;
- setiap tiket punya alamat sendiri; tiket yang disebut tiket lain bisa diklik;
- kolom bisa disembunyikan, `cancel` tersembunyi sejak awal;
- pindah proyek dari kepala halaman;
- kemajuan uji selagi berjalan: lama berjalan dan lama sejak keluaran terakhir
  (hijau, kuning setelah semenit diam, merah setelah lima menit);
- `--lan` mencetak alamat jaringan dan peringatan bahwa tidak ada kata sandi;
  tanpa `--lan` hanya `127.0.0.1`.

Satu aturan agen yang ditunda sampai viewer ada: di `kerjaan`, setiap
perintah Bash agen diberi `description` dalam bahasa papan, karena itulah
yang ditampilkan viewer sebagai langkah agen. Aturan itu belum ada di
`roles/*.md` kerjaan2; tambahkan hanya bila viewer memang menampilkannya, dan
ingat anggaran 6.000 kata (sekarang sekitar 5.700).

## Batasan teknis

- Node 18+, tanpa dependensi, seperti CLI.
- Perintah `k2 view` belum ada; `viewer/` belum ada. Cetak biru §12 dan §13
  menyebut tempatnya.
- Uji viewer ikut `node --test`; setiap uji membersihkan repo sementaranya.
- Viewer netral: tidak boleh bergantung pada Claude Code selain saat membaca
  transkrip.
- Keluaran uji bisa memuat rahasia; dengan `--lan` itu terlihat di jaringan.
  Viewer `kerjaan` menyatakannya dengan jelas; lakukan hal yang sama.

## Data hidup untuk mockup

`/Users/mirza/Workspace/k2-akunting/.kerjaan2/`: 15 tiket `done`, 1 di
`backlog`, 5 pemeriksaan tangan menunggu, asumsi yang sudah dikonfirmasi,
satu saran tindak lanjut yang sudah dijadikan tiket, dan jejak lengkap dengan
konflik serta integrasi. Papan itu sedang diam, jadi untuk bagian "Sedang
berjalan" dan antrean merge mockup perlu data contoh, atau papan sementara
yang dibuat seperti di `tests/k2.test.mjs`.

## Langkah pertama yang disarankan

1. Tanyakan tiga hal yang belum diputuskan (bahasa antarmuka, sumber kegiatan
   agen, laporan uji satu per satu).
2. Buat mockup Ruang kendali, Papan, dan Riwayat sebagai halaman statis dengan
   data dari `k2-akunting` ditambah data contoh untuk keadaan berjalan; minta
   persetujuan pemilik.
3. Baru bangun server dan halaman sungguhan, dengan uji.
4. Sesudah jadi, utus peninjau independen seperti pada tahap sebelumnya.
