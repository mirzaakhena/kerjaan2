# Galangan: padanan viewer kanban ke ruang 3D

Ditulis 13 November 2026, untuk versi 0.16.0; sepuluh macam kapal, pemutar
linimasa, perahu rombongan, dan drama review (dengan jangkar saat ditahan)
ditambahkan sesudahnya. Berkas ini mendaftar apa yang
terjadi di viewer kanban (`k2 view`) dan apa padanannya di halaman galangan
(`/p/<proyek>/space`), serta apa yang belum punya padanan. Keputusan dan batas
galangan ada di bagian "Galangan" pada akhir `docs/blueprint.md`.

Sumber kebenaran padanan ini adalah kode: `viewer/web/space/plan.js` (arti
papan dan arti tiap kejadian linimasa), `director.js` (pemutar adegan), dan
`cast.js` (tugas tiap pemeran).
Bila kode berubah, berkas ini ikut diperbarui.

## Catatan saat membaca galangan

- Bila papan tidak punya tiket yang berjalan, semua karakter hanya mengerjakan
  pekerjaan kecil pengisi waktu (menyapu dok, menata rak, meminyaki derek).
  Pekerjaan itu sengaja tidak menyebut tiket apa pun. Hubungan dengan papan
  baru terlihat saat ada tiket yang bergerak, atau di mode `?demo`.
- Galangan boleh tertinggal dari papan, tidak pernah mendahuluinya.
- Saat halaman baru dibuka, tiap tiket langsung diletakkan di tempatnya tanpa
  cerita. Cerita (karakter membawa sesuatu) hanya untuk kejadian yang terjadi
  selagi halaman terbuka.

## Linimasa: cara galangan mengikuti papan

Galangan tidak lagi membandingkan keadaan papan dari satu pembacaan ke
pembacaan berikutnya. Ia memutar linimasa tiap tiket (`log/<id>.jsonl`, lewat
`/api/p/<proyek>/timeline`): tiap kejadian satu adegan, berurutan per tiket.
Adegan berikutnya pada tiket yang sama baru mulai setelah adegan sebelumnya
selesai, jadi dua kejadian yang berdekatan (kriteria terpenuhi lalu tiket
diserahkan) keduanya diputar. Tiket yang berbeda berjalan bersamaan.

Untuk tiap tiket galangan menyimpan apa yang sudah ia perlihatkan: status,
kriteria mana yang terpenuhi atau dibatalkan, lulus atau belum, berapa kali
ditolak. Catatan itu hanya berubah ketika kejadiannya diputar. Karena itu
perubahan di papan tidak tampil sebelum adegannya tiba, dan tidak ada yang
tampil sebelum terjadi di papan.

**Jam galangan dan batas tertinggal.** Galangan dianggap tertinggal sejauh
umur kejadian tertua yang adegannya belum selesai.

| Tertinggal | Yang terjadi |
|---|---|
| sampai 30 detik | adegan diputar dengan kecepatan biasa |
| lebih dari 30 detik | adegan dipercepat: tertinggal dibagi 30 detik, paling banyak 4 kali (60 detik menjadi 2 kali, 120 detik ke atas menjadi 4 kali), sampai terkejar |
| lebih dari 5 menit | cerita dilepas: semua tiket langsung diletakkan di keadaan papan sekarang, seperti halaman yang baru dibuka |

Yang dipercepat hanya adegan (orang yang sedang membawa tiket, kapal yang
meluncur, lambung yang naik atau turun); pekerjaan pengisi waktu, laut, dan
kapal tunda tetap pada kecepatannya. Angkanya ada di `plan.js` (`CALM`,
`FAST`, `LATE`, `paceOf`).

**Kejadian dan adegannya.**

| Kejadian | Adegan |
|---|---|
| `created` | Perahu rombongan; Courier membawa peti ke rak ORDERS (lihat "Perahu rombongan") |
| `moved` ke todo | Draughtsman menggambar dan memasang gulungan di papan QUEUE |
| `started` | Foreman membawa gulungan ke dok kosong; lunas diletakkan |
| `check`, `uncheck`, `void` | Lambung naik atau turun |
| `submitted` | Shipwright dok itu meloncat senang (🥳). Di jalur light, yang lulus tanpa reviewer: layar langsung dipasang, tanpa Inspector |
| `verdict` lulus | Inspector mendatangi Shipwright, bicara singkat (💬 lalu "✓"); layar dan bendera dipasang; Shipwright meloncat senang (😄). Kapal tetap di doknya |
| `verdict` ditolak | Inspector memberi ❌; Shipwright sedih (😢) lalu kembali bekerja; kriteria yang disebut gagal dicabut, lambung turun |
| `accepted` (`k2 accept` sesudah ditolak) | Seperti lulus di jalur light: Shipwright meloncat senang, layar dipasang, tanpa Inspector |
| `submitted` dan `verdict` selagi main dibawa masuk sesudah lulus | Tanpa adegan; layar tetap terpasang |
| `landed` | Kapal meluncur dan berlabuh. Hanya kejadian ini yang meluncurkan kapal |
| `moved` ke cancel | Lambung dibongkar atau gulungan dibuang |
| `moved` mundur (misalnya todo ke backlog, atau dibuka lagi) | Langsung diletakkan, tanpa cerita |
| `agent`, `test`, `question`, `answer`, `assumption*`, `manual*`, `integrate`, `integrated`, `conflict`, `held`, `amended`, `released`, `retry` | Belum punya adegan: dilewati |

**Yang tetap dibaca dari keadaan papan**, karena tidak ada di linimasa:
langkah terakhir agen, uji yang sedang berjalan (lampu dok), agen macet,
reviewer yang sedang bekerja (Inspector berkeliling), ditahan atau dihentikan
(jangkar), pertanyaan yang menunggu pemilik, bendera kotak masuk, urutan
antrean, giliran merge. Semua itu tampil seketika.

**Sambungan putus.** Halaman mengingat sampai titik mana linimasa sudah
dibaca. Pembacaan yang gagal tidak menggeser titik itu, jadi setelah tersambung
lagi semua kejadian sejak titik itu datang satu kali: tidak ada adegan yang
hilang, tidak ada yang terulang.

Batas-batasnya:

- Titik baca hanya hidup di ingatan server dan berlaku 10 menit. Bila viewer
  (`k2 view`) dinyalakan ulang, atau halaman terputus lebih dari 10 menit,
  server tidak mengenali titiknya: galangan langsung diletakkan di keadaan
  sekarang tanpa cerita, lalu memutar lagi dari situ.
- Tab yang disembunyikan tidak menggambar, jadi adegan berhenti sementara
  kejadian terus menumpuk. Saat tab dibuka lagi berlaku tabel di atas.
- Bila galangan dan papan berbeda tanpa ada kejadian yang menjelaskannya
  (berkas tiket diubah dengan tangan, kontrak diubah, kejadian yang belum
  dikenal galangan), tiket itu diletakkan sesuai papan tanpa cerita pada
  pembacaan kedua. Satu pembacaan saja belum cukup, sebab papan bisa terbaca
  tepat di antara berkas yang pindah dan kejadiannya yang ditulis.
- Tiket yang muncul di papan tanpa kejadian `created` (berkas ditaruh dengan
  tangan) diletakkan di tempatnya dengan cara yang sama, tanpa perahu.
- Mode `?demo` mengarang linimasanya sendiri dalam bentuk yang sama dengan
  jawaban server, jadi demo diputar oleh mesin yang sama dengan papan
  sungguhan: satu tiket bisa ditonton dari pesanan sampai berlabuh.

## Perahu rombongan

Tiket baru (kejadian `created`) datang dengan perahu kecil, serombongan.

- **Satu rombongan** adalah tiket-tiket yang dibuat berdekatan: tiap tiket
  dibuat paling lama **60 detik** sesudah tiket sebelumnya di rombongan itu,
  selagi perahunya belum pergi dari dermaga. Yang dihitung adalah waktu tiket
  dibuat di papan, bukan waktu adegannya diputar. Angkanya `GROUP` di
  `plan.js`, aturannya `joins`.
- Perahu berangkat begitu tiket pertama terlihat; galangan tidak menunggu
  rombongannya lengkap. Tiket yang dibuat selagi perahu masih di jalan atau
  berlabuh ikut naik. Tiket yang dibuat lebih dari 60 detik sesudah tiket
  sebelumnya, atau sesudah perahu pergi, menunggu perahu berikutnya, yang baru
  muncul setelah perahu sebelumnya hilang dari pandangan.
- Perahu muncul dari ujung laut (tepi luar teluk), berlabuh di sisi dermaga,
  lalu pergi memutari ujung dermaga ke sisi seberangnya dan menghilang. Di
  luar itu tidak ada perahu di dermaga.
- Courier hanya berjalan ke dermaga setelah perahu berlabuh. Ia mengambil satu
  peti, berapa pun isi rombongannya; saat peti diangkat perahu pergi, dan
  rombongan itu tertutup. Semua tiket rombongan muncul di rak ORDERS pada saat
  Courier tiba di sana, tidak sebelumnya. Pekerjaan pengisi waktu Courier tidak
  lagi membawanya ke dermaga.
- Tiket usulan yang lahir sesudah tiket lain selesai memakai kejadian
  `created` yang sama, jadi datang dengan cara yang sama.
- Mode `?demo` menulis pesanan beberapa sekaligus; kiriman pertamanya, tidak
  lama setelah halaman dibuka, selalu satu rombongan berisi tiga tiket.

Batas-batasnya:

- Bentuk perahunya masih perahu dayung yang lama; bentuk baru belum dipilih.
- Courier dipanggil oleh perahu yang berlabuh, bukan oleh lonceng Keeper (belum
  diputuskan).
- Bila Courier sedang sibuk, perahu menunggu di dermaga sampai ia datang, dan
  perahu berikutnya ikut tertunda. Bila galangan tertinggal lebih dari 5
  menit, tiket langsung diletakkan di rak tanpa menunggu peti.
- Rak ORDERS memuat 12 gulungan; rombongan yang lebih besar tetap dibawa satu
  peti, sisanya tidak digambar.

## Review, lulus, dan jangkar

Review adalah adegan, dan lulus belum berarti meluncur.

- **Diserahkan** (`submitted`): Shipwright dok itu meloncat senang dengan
  balon 🥳.
- **Reviewer bekerja** (dibaca dari keadaan papan): Inspector datang ke kapal
  itu dan mengelilinginya: menyusuri satu sisi, kembali lewat jalan di belakang
  dok, lalu menyusuri sisi lainnya, berhenti memeriksa di empat titik. Selama
  reviewer masih bekerja ia mengulang putaran itu. Bila beberapa kapal sedang
  direview, ia berkeliling bergiliran.
- **Lulus** (`verdict` lulus): Shipwright menunggu di sisi dok. Inspector
  mendekatinya dan bicara singkat (💬, lalu "✓"). Saat itulah layar dan bendera
  dipasang, tidak sebelumnya; Shipwright meloncat senang (😄). Kapal tetap di
  doknya.
- **Ditolak** (`verdict` ditolak): Inspector mendekati Shipwright dan memberi
  ❌. Lambung baru turun sesudah ❌ itu, tidak selagi Inspector masih di jalan.
  Shipwright sedih (😢, menggeleng), lalu kembali memalu.
- **Lulus tanpa reviewer** (jalur light, atau `k2 accept`): Shipwright
  meloncat senang (🥳) dan layar langsung dipasang. Inspector tidak datang,
  sebab tidak ada reviewer yang bekerja.
- **Inspector hanya satu.** Tiap vonis ia antarkan sendiri, satu kapal sampai
  selesai baru kapal berikutnya, menurut urutan kejadiannya; adegan tiket lain
  menunggu gilirannya. Vonis tidak lagi ditampilkan tanpa ia datang. Bila ia
  belum sempat mengelilingi kapal itu (vonis datang bersamaan dengan
  penyerahan, atau galangan sedang mengejar), ia berkeliling dulu satu
  putaran. Vonis yang sudah menunggu didahulukan dari putaran keliling.
- **Meluncur hanya saat `landed`.** Kapal yang lulus menunggu di doknya dengan
  layar terpasang, berapa pun lamanya dan di urutan mana pun dalam antrean
  merge. Peluncurannya sendiri tidak berubah dari 0.16.0.
- **Jangkar.** Kapal yang sudah lulus tetapi ditahan (`held`) atau dihentikan
  (`stopped`) menurunkan jangkar di sisi haluannya, dan jangkar itu tinggal di
  dermaga dok selama penahanan berlangsung. Begitu dilepas (pertanyaan
  dijawab, `k2 retry`, atau `k2 land` berhasil), jangkar naik lagi dan
  disimpan. Jangkar baru turun sesudah adegan lulusnya selesai (layar sudah
  terpasang). Tiket yang dihentikan sebelum lulus tidak berjangkar.
- **Main dibawa masuk sesudah lulus:** layar tetap terpasang dan Shipwright
  bekerja seperti biasa; penyerahan dan vonis ulangnya tidak punya adegan.
- Balon perasaan (🥳, 😄, 😢), 💬, dan ❌ digambar kira-kira tiga kali lebih besar
  daripada balon tanda ("?", "!", "✓") supaya terbaca dari jarak kamera biasa.
- Mode `?demo` memperlihatkan ketiganya bergiliran: review pertama lulus,
  review kedua ditolak sekali lalu lulus, review ketiga lulus lalu ditahan
  sekitar satu menit sebelum dilepas dan mendarat; begitu seterusnya.

Batas-batasnya:

- Penahanan dan pelepasannya dibaca dari keadaan papan, bukan dari linimasa:
  papan hanya menulis kejadian `held` saat merge ditolak, dan tidak menulis
  apa pun saat penahanan dilepas. Karena itu jangkar naik seketika saat papan
  berubah, walau adegan lain tiket itu masih tertinggal.
- Putaran keliling Inspector juga dibaca dari keadaan (ada reviewer di tiket
  itu), bukan dari kejadian `agent`.
- Urutan vonis menurut kejadian berlaku di antara vonis yang sedang menunggu
  Inspector; vonis yang adegannya sudah ia mulai tidak disela.
- Bentuk jangkar dibuat dari bentuk dasar, bukan model dari ruang pamer.

## Pemeran

| Karakter | Padanan di kerjaan2 |
|---|---|
| Courier | penerima tiket baru (tidak ada agen untuk ini) |
| Draughtsman | planner |
| Foreman | mandor (sesi utama), hanya saat `k2 start` |
| Shipwright 1–4 | worker; satu tukang per dok, satu dok per tiket yang berjalan |
| Inspector | reviewer |
| Crane operator | merge (`k2 land`) |
| Keeper | kotak masuk pemilik |

## Yang sudah punya padanan

| Saat di viewer kanban… | …di galangan |
|---|---|
| Tiket baru muncul (selagi halaman terbuka), termasuk usulan sesudah tiket lain selesai | Perahu rombongan datang dari ujung laut dan berlabuh di dermaga; Courier berjalan ke ujung dermaga, mengambil satu peti, dan menaruh semua tiket rombongan itu di rak ORDERS; perahu pergi ke sisi lain dan menghilang |
| Tiket ada di kolom backlog | Satu gulungan di rak ORDERS |
| Tiket pindah backlog → todo (hasil kerja planner) | Draughtsman mengambil gulungan dari rak, menggambar di meja DRAWINGS, lalu memasangnya di papan QUEUE |
| Tiket ada di kolom todo | Gulungan di papan QUEUE, urutannya sama dengan antrean |
| Tiket pindah todo → in_progress (`k2 start`) | Foreman mengambil gulungan dari papan dan membawanya ke dok kosong; lunas kapal muncul |
| Kartu agen "worker" di Control room | Shipwright dok itu memalu lambung; keterangannya adalah langkah terakhir agen dari transkrip |
| Kriteria "Done when" tercentang, dicabut, atau dibatalkan | Lambung naik atau turun: seperempat sejak lunas diletakkan, sisanya menurut bagian kriteria yang terpenuhi. Kriteria yang dibatalkan dan kriteria `(owner)` tidak dihitung, jadi lambung penuh saat semua bagian worker terpenuhi. Lambung tidak bergerak karena hal lain |
| Uji sedang berjalan (hijau, kuning, merah) | Lampu di tiang dok menyala dengan warna yang sama; Shipwright "testing" |
| Agen macet (stuck) | Shipwright atau Inspector menggeleng dengan balon "?" |
| Pertanyaan menunggu pemilik pada tiket itu | Shipwright duduk menunggu dengan balon "?" |
| Tiket pindah ke review, kartu agen "reviewer" | Shipwright meloncat senang (🥳). Lambung sudah penuh (semua kriteria worker terpenuhi sebelum diserahkan), belum berlayar; Inspector mengelilingi kapal itu (bergiliran bila lebih dari satu) |
| Reviewer menolak | Inspector memberi ❌ kepada Shipwright; Shipwright sedih (😢) lalu kembali bekerja; lambung turun bila ada kriteria yang dicabut |
| Reviewer meluluskan (lencana ⚠ belum di-merge) | Inspector mendekati Shipwright dan bicara singkat; layar dan bendera kapal dipasang; Shipwright senang (😄). Kapal tetap di doknya |
| Lulus tanpa reviewer (jalur light, `k2 accept`) | Shipwright meloncat senang (🥳), layar dipasang, tanpa Inspector |
| Lulus tetapi ditahan atau dihentikan (held, stopped) | Kapal menunggu di doknya dengan jangkar turun; jangkar naik lagi begitu dilepas |
| Tiket nomor 1 di antrean merge | Crane operator bersiap meluncurkan kapal itu |
| Tiket landed → done | Baru saat inilah kapal meluncur: setelah adegan sebelumnya selesai, kapal meluncur di landasan ke air dan berlabuh di teluk; empat kapal terbaru tinggal, yang tertua berlayar pergi |
| Tiket cancel | Shipwright membongkar lambungnya, atau Courier membuang gulungannya ke TIMBER |
| "Waiting for you" berisi N butir | N bendera (paling banyak 5) di dekat mercusuar; Keeper memberi isyarat |
| Judul dan nomor tiket | Papan nama di kepala landasan tiap dok; kartu tiket saat kapal atau gulungan diklik |
| Ukuran kontrak (jumlah kriteria) | Ukuran kapal: kecil (≤3), sedang (≤6), besar |
| ID tiket | Macam kapal, satu dari sepuluh corak, tetap sejak lunas di dok sampai berlabuh (lihat "Sepuluh macam kapal") |

## Sepuluh macam kapal

Ukuran kapal mengikuti jumlah kriteria; coraknya mengikuti ID tiket. Hash
kecil atas ID (bukan angka ID langsung, karena ID adalah cap waktu yang
berurutan) memilih satu dari sepuluh corak, dan tiap corak berlaku untuk
ketiga ukuran. Karena hanya ID yang dihitung, tiket yang sama mendapat kapal
yang sama di tiap pemuatan halaman dan di tiap perangkat. Aturannya ada di
`liveryOf` (`plan.js`); warnanya di `LIVERY` (`world.js`).

| Corak | Lambung | Layar | Bendera |
|---|---|---|---|
| `white` | biasa | putih | putih |
| `red` | biasa | merah | merah |
| `teal` | biasa | toska | toska |
| `yellow` | biasa | kuning | kuning |
| `blue` | biasa | biru | biru |
| `green` | biasa | hijau | hijau |
| `orange` | biasa | jingga | jingga |
| `purple` | biasa | ungu | ungu |
| `pirate-red` | bajak laut | hitam bertengkorak | merah |
| `pirate-white` | bajak laut | hitam bertengkorak | putih |

- Layar hitam bertengkorak digambar di modelnya dan tidak bisa diwarnai; dua
  kapal bajak laut dibedakan dari benderanya saja.
- Corak baru terlihat penuh setelah tiket lulus (layar dan bendera
  dipasang). Sebelum itu, di dok, hanya bentuk lambung yang membedakan: biasa
  atau bajak laut.
- Mengubah `liveryOf` atau urutan `LIVERIES` mengganti kapal semua tiket di
  semua papan.
- Mode `?demo` memilih ID buatannya sehingga kesepuluh corak muncul
  bergiliran, dengan satu kapal bajak laut di antara yang pertama berlabuh.

## Yang ada di viewer tetapi belum punya padanan

- **Planner sedang bekerja.** Papan tidak mencatat kapan planner berjalan,
  hanya hasilnya. Draughtsman baru bergerak setelah tiket sudah pindah ke
  todo, bukan selama planning.
- **Mandor (sesi utama).** Foreman hanya bergerak saat `start`; kegiatan sesi
  utama lainnya tidak terlihat.
- **Alasan tiket todo tertahan** ("starts after X lands", jeda): gulungannya
  tampil sama dengan yang siap.
- **Main dibawa masuk sebelum merge** (worker atau reviewer dipanggil lagi
  setelah lulus): tampil seperti kerja biasa, layar tetap terpasang.
- **Posisi 2 dan seterusnya di antrean merge:** tidak dibedakan.
- **Jenis butir kotak masuk** (asumsi, cek tangan, follow-up, ditolak dua
  kali, kontrak berubah): semuanya hanya menjadi bendera.
- **Worktree yatim, tiket rusak, giliran uji** (test turn): tidak tampil.
- **Jalur (lane), model, ronde ke berapa:** tidak tampil di adegan; penolakan
  hanya di kartu tiket.
- **Tab History** (lama pengerjaan, tingkat penolakan): tidak ada.
- **Lebih dari yang muat:** tiket berjalan kelima dan seterusnya menunggu
  sebagai gulungan di papan QUEUE; rak memuat 12 gulungan dan papan 8,
  sisanya tidak digambar dan tidak diberi tanda.

## Usul kelanjutan (belum diputuskan pemilik)

1. **Planner bekerja.** Butuh catatan baru di papan: hook sudah mencatat
   worker dan reviewer, planner belum. Ini perubahan di inti (`core/`,
   `hooks/`), bukan hanya di galangan.
2. **Alasan todo tertahan.** Gulungan yang menunggu tiket lain diberi pita
   warna berbeda.
