---
type: bug
priority: medium
lane: standard
labels: []
blocked_by: []
related: []
touches: []
created: 2026-11-13 21:10
---

## Background

Saat worker menyerahkan tiketnya, uji berjalan beberapa menit. Bila uji itu
harus menunggu giliran, penyerahan berpindah ke latar belakang dan agen
berhenti sebentar sambil menunggunya; Claude Code lalu memberi tahu mandor
bahwa agen itu "menunggu pekerjaan latarnya sendiri" dan akan melapor
sesudahnya. Papan mencatat perhentian sementara itu sebagai agen yang sudah
berakhir, sehingga `k2 next` menyuruh mandor membangunkannya dengan alasan
"it ended without handing over". Agen itu sebenarnya masih hidup; bila
dibangunkan, ia bisa menjalankan penyerahan dua kali.

Ditemukan pada 2026-11-13 di papan repo ini sendiri: worker tiket 261113190707
berhenti menunggu ujinya, `k2 next` mencetak `RESUME`, mandor tidak
membangunkannya, dan beberapa menit kemudian worker itu melapor `SUBMITTED`
sendiri. Worker 261113190701 dan 261113190702 berhenti dengan cara yang sama.

## How to reproduce

1. Di papan dengan uji yang berjalan beberapa menit, mulai dua tiket dan kirim worker untuk keduanya
2. Biarkan keduanya menyerahkan tiket pada waktu yang berdekatan, sehingga yang kedua menunggu giliran uji dan agennya berhenti sementara
3. Jalankan `k2 next` selagi worker kedua masih menunggu

`k2 next` mencetak `RESUME ... it ended without handing over` untuk worker
yang masih menunggu ujinya sendiri.

## Request

Papan membedakan agen yang berhenti sementara karena menunggu pekerjaannya
sendiri (uji atau penyerahan yang masih berjalan) dari agen yang benar-benar
berakhir tanpa serah-terima, sehingga mandor tidak disuruh membangunkan agen
yang masih bekerja.

## Done when

- [ ] Selagi penyerahan atau uji sebuah tiket masih berjalan, `k2 next` mengatakan `WAIT` untuk worker tiket itu, bukan `RESUME`, walaupun agennya tercatat berhenti.
- [ ] Agen yang berhenti tanpa menyerahkan dan tanpa ada uji atau penyerahan yang berjalan tetap dilaporkan sebagai berakhir tanpa serah-terima, seperti sekarang.
- [ ] Bila penyerahan yang ditunggu itu gagal atau prosesnya mati, `k2 next` kembali menyuruh mandor bertindak; tiket tidak menunggu selamanya.
- [ ] Hal yang sama berlaku untuk reviewer yang menunggu ujinya sendiri.
- [ ] Ada uji otomatis untuk keempat hal di atas, dan uji itu gagal bila perbaikannya dibatalkan.
- [ ] Teks yang dibaca mandor tentang arti `WAIT` dan agen yang berakhir tetap cocok dengan perilaku baru, dalam anggaran katanya.
