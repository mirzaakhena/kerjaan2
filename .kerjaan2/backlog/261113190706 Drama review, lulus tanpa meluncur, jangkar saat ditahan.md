---
type: feature
priority: medium
lane: standard
labels: []
blocked_by: []
related: []
touches: []
created: 2026-11-13 19:07
---

## Background

Di galangan 0.16.0 review hanya terlihat sebagai Inspector yang berkeliling
lalu memberi "✓" atau "✗", dan kapal yang lulus tetapi ditahan atau dihentikan
tampil sama dengan yang menunggu giliran merge. Pemilik memutuskan (keputusan
29 dan 30 di `docs/galangan-tahap2.md`): review diberi drama, lulus belum
berarti meluncur, dan kapal yang ditahan menunggu dengan jangkar turun. Tiket
ini dibangun di atas pemutar linimasa.

## Request

Review menjadi adegan: tukang yang menyerahkan pekerjaannya meloncat senang,
Inspector datang dan mengelilingi kapal, lalu lulus (bicara singkat, tukang
senang, layar dipasang) atau ditolak (❌, tukang sedih dan kembali bekerja).
Kapal yang lulus tetap di doknya dan baru meluncur saat tiketnya mendarat di
main; selama ditahan atau dihentikan, jangkarnya turun.

## Done when

- [ ] Saat tiket diserahkan untuk review, tukangnya meloncat senang dengan balon 🥳.
- [ ] Saat reviewer bekerja, Inspector datang ke kapal itu dan mengelilinginya.
- [ ] Lulus: Inspector mendekati tukang dan bicara singkat, tukang senang, layar dipasang; kapal tetap di doknya.
- [ ] Ditolak: Inspector memberi ❌, tukang sedih lalu kembali bekerja.
- [ ] Kapal hanya meluncur dan berlabuh saat tiketnya mendarat (`landed`), tidak saat lulus.
- [ ] Kapal lulus yang ditahan atau dihentikan menunggu dengan jangkar turun; jangkar naik lagi begitu dilepas.
- [ ] Mode `?demo` memperlihatkan satu tiket lulus, satu ditolak lalu lulus, dan satu ditahan. `docs/galangan-padanan.md` diperbarui.
- [ ] (owner) Senang, sedih, dan ❌ terbaca jelas dari jarak kamera biasa.

## Out of scope

Peran derek putar dan kapal tunda dalam peluncuran, serta main yang dibawa
masuk sebelum merge (belum diputuskan pemilik).
