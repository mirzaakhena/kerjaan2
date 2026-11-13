# Lessons

What earlier tickets learned about this project. Newest last; k2 keeps the last 60.

- Perintah lewat k2 test -- dijalankan oleh shell: pola dengan | atau spasi harus dihindari (pakai --test-name-pattern berulang).
- Galangan: model yang dipakai harus disebut sebagai string 'kit/nama' di world.js atau cast.js dan ada di viewer/web/space/kits; uji menolak selisih di kedua arah.
- SubagentStop bisa tiba sebelum PostToolUse alat Agent bila agen dijalankan di latar depan: hook yang mencatat 'sedang bekerja' harus memeriksa status 'completed' atau berhenti yang sudah terlihat.
