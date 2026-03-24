# Emotsiooni kaamera

See veebirakendus:
- lülitab kaamera sisse;
- tuvastab näo emotsiooni (`rõõm`, `kurbus`, `neutraalne`, `viha`);
- muudab kogu lehe tausta vastavalt emotsioonile.

## Käivitamine

Kaamera töötab ainult veebikontekstis (`http://localhost` või `https`), mitte otse `file://` avades.

Variant 1 (Python):

```bash
python -m http.server 5500
```

Ava brauseris: `http://localhost:5500`

Variant 2 (Node):

```bash
npx serve .
```

Ava aadress, mida terminal näitab.

## Emotsiooni värvid

- rõõm / smile: kollakas-oranž
- kurbus / sad: sinakas
- neutraalne / neutral: hallikas
- viha / angry: punakas
