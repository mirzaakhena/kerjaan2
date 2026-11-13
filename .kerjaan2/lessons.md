# Lessons

What earlier tickets learned about this project. Newest last; k2 keeps the last 60.

- Perintah lewat k2 test -- dijalankan oleh shell: pola dengan | atau spasi harus dihindari (pakai --test-name-pattern berulang).
- Galangan: model yang dipakai harus disebut sebagai string 'kit/nama' di world.js atau cast.js dan ada di viewer/web/space/kits; uji menolak selisih di kedua arah.
- SubagentStop bisa tiba sebelum PostToolUse alat Agent bila agen dijalankan di latar depan: hook yang mencatat 'sedang bekerja' harus memeriksa status 'completed' atau berhenti yang sudah terlihat.
- Galangan: uji director memakai stagedYard dengan journal adegan; kejadian diumpankan lewat dir.update(board, trailOf([E(id, 'check', { n: 1 })])), dan settle() ikut menjalankan frame supaya lambung sampai.
- Halaman galangan bisa dijalankan tanpa layar: playwright Python dengan --use-angle=metal --enable-gpu memberi 60 bingkai per detik; swiftshader hanya 10 dan membuat adegan tampak tertinggal.
