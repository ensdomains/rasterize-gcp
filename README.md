# ENS Rasterization as a Service

ENS rasterization service that rasterize ENS NFT vectoral images to PNG.

[![Run on Google Cloud](https://storage.googleapis.com/cloudrun/button.svg)](https://deploy.cloud.run)

## API

### POST:

#### Query:
- `res`: Predefined image resolution. (_low_ | _high_) Default: `low`
<br/>
e.g. `http://localhost:8080/rasterize?res=high`

#### Body:
- `networkName`: Network name (_mainnet_ | _rinkeby_ ...)
- `contractAddress`: ENS Base Registrar Contract address for v1, NameWrapper Contract address for v2
- `tokenId`: Labelhash(v1) /Namehash(v2) of your ENS name.

## Running the server locally

- Build docker with `docker build . -t rasterize`
- Start with `docker run -p 8080:8080 rasterize`
- Service is ready to listen POST requests at http://localhost:8080/rasterize
