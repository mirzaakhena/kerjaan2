# Lessons

What earlier tickets learned about this project. Newest last; k2 keeps the last 60.

- Perintah lewat k2 test -- dijalankan oleh shell: pola dengan | atau spasi harus dihindari (pakai --test-name-pattern berulang).
- Galangan: model yang dipakai harus disebut sebagai string 'kit/nama' di world.js atau cast.js dan ada di viewer/web/space/kits; uji menolak selisih di kedua arah.
- SubagentStop bisa tiba sebelum PostToolUse alat Agent bila agen dijalankan di latar depan: hook yang mencatat 'sedang bekerja' harus memeriksa status 'completed' atau berhenti yang sudah terlihat.
- Galangan: uji director memakai stagedYard dengan journal adegan; kejadian diumpankan lewat dir.update(board, trailOf([E(id, 'check', { n: 1 })])), dan settle() ikut menjalankan frame supaya lambung sampai.
- Halaman galangan bisa dijalankan tanpa layar: playwright Python dengan --use-angle=metal --enable-gpu memberi 60 bingkai per detik; swiftshader hanya 10 dan membuat adegan tampak tertinggal.
- Galangan: uji perahu rombongan memakai heldBoat(yard, log) di tests/viewer.test.mjs; mailIn/mailOut ditahan sampai boat.pass(), dan stations di stagedYard kini bernama (to.name).
- Galangan: orang yang berdiri di bawah atap gudang (stations.shelf) tertutup dari kamera awal; adegan yang harus terlihat pakai tempat di luar atap seperti stations.reading.
- Galangan: letak dok, jalan, dan lebar pulau dihitung yardOf di plan.js dan diuji lewat footprints; world.js hanya menggambar. Benda baru di dermaga harus masuk grup back, east, west, atau docks supaya ikut bergeser.
- k2 view ditolak untuk worker: halaman galangan mode demo bisa dilihat dengan server berkas statis atas viewer/web (space.html di /p/<nama>/space, sisanya di /assets).
- Galangan: uji adegan review membaca 'drama' dari stagedYard (siapa berkata, bergerak, dan ke titik dok mana); tiket tanpa kejadian baru ditaruh pada pembacaan kedua, jadi uji memanggil dir.update dua kali sebelum memakainya.
- Scratchpad dipakai bersama worker lain: taruh berkas sementara di subfolder bernama tiket, dan halaman ?demo bisa dilihat lewat server berkas statis kecil (k2 view dan k2 init bukan milik worker).
