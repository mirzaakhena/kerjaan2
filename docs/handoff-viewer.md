# Serah-terima: sesudah Tahap 3 (viewer)

Ditulis 12 November 2026 untuk sesi baru yang tidak punya ingatan apa pun
tentang proyek ini. Baca `CLAUDE.md` dan `docs/blueprint.md` lebih dulu;
berkas ini hanya memuat keadaan sekarang dan yang masih terbuka.

## Keadaan sekarang

- Versi **0.15.1**, tidak pernah di-push. Tahap 1 (inti), Tahap 2 (paralel,
  antrean merge), dan Tahap 3 (viewer) sudah dibangun.
- `k2 view` berjalan; keputusan dan batasnya ada di bagian "Tahap 3: viewer"
  pada akhir `docs/blueprint.md`.
- Uji: `tests/k2.test.mjs` (CLI) dan `tests/viewer.test.mjs` (viewer).
- Satu putaran tinjauan independen atas 0.15.0 sudah dijalankan; temuan dan
  yang diperbaiki di 0.15.1 ada di bagian akhir cetak biru.

## Yang sudah dilihat berjalan, dan yang belum

**Dilihat di browser (Chrome tanpa kepala, tampilan terang, 1512×860):**

- terhadap papan nyata `k2-akunting` yang sedang diam: Control room, Board,
  History, laci tiket tab Record, dan halaman daftar proyek;
- terhadap papan peraga sementara dengan tiket berjalan: kartu agen dengan
  langkah dari transkrip tiruan, uji berjalan dengan keluaran yang bertambah,
  worktree yatim, pertanyaan menahan; juga lebar 500 piksel.

**Belum pernah dilihat:**

- tampilan gelap viewer sungguhan (hanya mockup yang dilihat pemilik);
- viewer selama sesi kerjaan2 sungguhan: hook 0.15.0 yang mencatat letak
  transkrip, langkah agen dari transkrip asli, antrean merge yang terisi,
  merge tertahan, agen macet;
- HP sungguhan dan `--lan` dari perangkat lain;
- papan besar (ratusan tiket).

## Terbuka

- Tema: mockup barak dan HUD ada di `docs/mockups/`; pemilik ingin keduanya
  kelak menjadi pilihan tema. Belum dirancang cara berganti tema.
- Aturan `description` pada perintah Bash agen baru masuk teks peran; belum
  terlihat apakah agen mematuhinya di sesi sungguhan.
- Daftar terbuka dari tahap sebelumnya masih berlaku: uji konkurensi otomatis,
  proses `k2` yang dimatikan di tengah uji, `.worktrees/` terhadap Jest,
  Vitest, ESLint dan Flutter, uji pemicu deskripsi skill, serta batas penjaga
  peran yang diterima (lihat cetak biru).
- Yang belum pernah terlewati di sesi sungguhan sejak Tahap 2: hook berhenti,
  penolakan oleh peninjau, pertanyaan di tengah jalan, agen macet, merge
  tertahan, penolakan oleh penjaga peran, uji yang lambat, ringkasan konteks.

## Galangan (0.16.0)

Sesudah berkas ini ditulis, viewer mendapat halaman 3D `/p/<proyek>/space`.
Keputusan, padanan papan ke galangan, batas, dan apa yang sudah dan belum
dilihat ada di bagian "Galangan" pada akhir `docs/blueprint.md`.

## Peta viewer

| Berkas | Isi |
|---|---|
| `viewer/server.mjs` | server HTTP, rute, `text/event-stream`, perintah `view` |
| `viewer/snapshot.mjs` | daftar proyek, keadaan papan, keadaan hidup, satu tiket penuh |
| `viewer/transcript.mjs` | langkah terakhir agen dari transkrip Claude Code |
| `viewer/web/app.js` | semua halaman; tab, saringan, dan tiket terbuka ada di alamat |
| `viewer/web/trail.js` | arti tiap baris jejak, dipakai halaman dan diuji |
| `viewer/web/replay.js` | jam replay tab Board (murni): papan pada waktu mana pun, jeda sepi dipadatkan |
| `viewer/web/style.css` | gaya; warna sebagai token, terang dan gelap |
| `viewer/web/fonts/` | IBM Plex (lisensi OFL, `LICENSE.txt` ikut) |

Alamat: `/` daftar proyek · `/p/<proyek>/` halaman proyek
(`?tab=board|history`, `?q=`, `?lane=`, `?hide=`, `?t=<id>&pane=record|timeline`)
· `/api/projects` · `/api/p/<proyek>/state` · `/api/p/<proyek>/ticket/<id>`
· `/api/p/<proyek>/events` · `/api/p/<proyek>/timeline?since=<titik>`
· `/api/p/<proyek>/history`.

`timeline` menjawab `{ now, point, reread, events }`: kejadian linimasa semua
tiket papan itu sesudah `since`, terlama dulu, tiap kejadian dengan `ticket`
dan `at`. Tanpa `since`: tanpa sejarah, hanya `point` untuk permintaan
berikutnya. Titik yang tidak dikenali, lebih dari 10 menit ke belakang, atau
dari papan yang sudah diganti: tanpa sejarah, `reread: true` (halaman membaca
ulang `state`). Titik hanya hidup di ingatan server; server yang dinyalakan
ulang tidak mengenal titik lama.

`history` menjawab seluruh sejarah sekaligus untuk replay tab Board:
`{ now, end, tickets, events }`. Tiap tiket membawa `steps` (kolom yang
dilaluinya, dihitung `columnAfter` dari jejak); tiket yang jejaknya tidak
berakhir di kolomnya sekarang diberi langkah `untracked` di akhir, sehingga
replay selalu berakhir persis di papan saat dibuka. Replay tidak masuk alamat
dan berhenti saat tab berganti.

Data untuk mencoba: `/Users/mirza/Workspace/k2-akunting/.kerjaan2/` (jangan
ditulis kecuali lewat sesi sungguhannya sendiri).
