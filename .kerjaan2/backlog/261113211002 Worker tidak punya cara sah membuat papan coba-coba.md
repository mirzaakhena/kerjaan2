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

Penjaga peran menolak perintah milik mandor dan pemilik (`k2 init`, `k2 new`,
dan lainnya) bila dijalankan dari dalam agen. Itu benar untuk papan yang
sedang dikerjakan. Tetapi di repo ini pekerjaannya adalah kerjaan2 sendiri:
untuk melihat hasil kerjanya berjalan (misalnya viewer dengan kejadian
sungguhan), worker dan reviewer perlu papan coba-coba di folder sementara yang
mereka gerakkan dengan `k2` dari worktree-nya. Penjaga peran menolak itu juga,
karena ia tidak membedakan papan coba-coba dari papan yang sebenarnya.

Pada 2026-11-13, di papan repo ini: worker 261113190701 dan 261113190702
masing-masing mengosongkan penanda perannya untuk membuat dan menggerakkan
papan coba-coba di folder sementara (keduanya melaporkannya sendiri); worker
261113190707 ditolak dan memilih tidak mengakalinya, sehingga hanya melihat
mode demo. Uji otomatis repo ini mengosongkan penanda yang sama. Tidak ada
yang tersentuh di luar folder sementara, tetapi jalan keluarnya sekarang
adalah mematikan penjaga dengan tangan, dan tiap agen memutuskannya sendiri.

Hal yang berdekatan, dari hari yang sama: semua agen satu sesi memakai folder
sementara yang sama, dan berkas bantu mereka saling menimpa (worker
261113190706 menimpa server statis milik worker 261113190705; berkas catatan
worker 261113190706 ditimpa agen lain). `k2 view` juga ditolak untuk worker,
sehingga mereka menonton halaman lewat server berkas statis buatan sendiri.

## How to reproduce

1. Di sesi dengan plugin kerjaan2, mulai sebuah tiket dan kirim worker-nya
2. Dari dalam worker itu, buat repo git baru di folder sementara dan jalankan `k2 init` di sana

Papan menolak: perintah itu bukan milik worker, walaupun repo itu bukan papan
yang sedang dikerjakan.

## Request

Agen yang mengerjakan kerjaan2 punya cara yang sah dan tertulis untuk membuat
dan menggerakkan papan coba-coba di folder sementara, tanpa mematikan penjaga
peran dengan tangan, dan tanpa melonggarkan penjaga untuk papan yang
sebenarnya.

## Done when

- [ ] Dari dalam worker atau reviewer, papan coba-coba di folder sementara bisa dibuat dan digerakkan (tiket baru, mulai, serahkan, vonis, mendarat) dengan cara yang tertulis di brief-nya.
- [ ] Dari dalam agen yang sama, perintah milik mandor atau pemilik terhadap papan yang sebenarnya tetap ditolak seperti sekarang.
- [ ] Cara itu tidak bisa dipakai untuk menggerakkan papan yang sebenarnya, juga bukan papan repo lain di mesin yang sama.
- [ ] Brief worker dan reviewer menyebut cara itu, dan tidak lagi ada alasan mengosongkan penanda peran dengan tangan; teksnya tetap dalam anggaran kata.
- [ ] Ada uji otomatis untuk tiga baris pertama, dan uji itu gagal bila perbaikannya dibatalkan.

## Out of scope

Mengubah apa yang boleh dijalankan tiap peran terhadap papan yang sebenarnya.
