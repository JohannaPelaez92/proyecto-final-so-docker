# Proyecto final: infraestructura con Docker, Nginx y monitoreo

Proyecto final de Sistemas Operativos, Universidad Autónoma de Occidente.
Autora: Johanna Isabel Peláez Jiménez.

Este repositorio levanta con un solo comando una infraestructura completa en contenedores: un servidor Nginx que reparte el tráfico entre tres instancias de una aplicación Flask, y un sistema de monitoreo con Prometheus y Grafana que mide tanto la aplicación como los propios contenedores.

## Arquitectura

```
                      Tu navegador / curl / k6
                                |
                           puerto 8080
                                |
                             [ Nginx ]  ---- puerto interno 8088 (stub_status)
                                |                     |
                +---------------+---------------+     |
                |               |               |     |
             [ app1 ]        [ app2 ]        [ app3 ] |
                |               |               |     |
                | /metrics      | /metrics      | /metrics
                |               |               |     |
                |               |               |  [ nginx-exporter ]
                |               |               |     |
                +---------------+-------+-------+-----+
                                        |
                  [ cAdvisor ] -------> [ Prometheus ] -------> [ Grafana ]
                (CPU, memoria, red                          (dashboards)
                 de cada contenedor)
```

Los ocho contenedores viven en una red Docker propia llamada `red-proyecto`, y se encuentran entre sí por el nombre del servicio (por ejemplo, Nginx le habla a `app1:5000`).

Nginx hace de proxy inverso y reparte las peticiones por turnos entre los tres backends. Cada backend es una aplicación Flask que responde con el nombre de su instancia y publica sus métricas en `/metrics`. Nginx no habla el formato de Prometheus, así que el exportador de Nginx lee su estado interno (`stub_status`) y lo traduce. cAdvisor mide el consumo de recursos de cada contenedor. Prometheus visita todas esas fuentes cada 5 segundos y guarda las series de tiempo, y Grafana las dibuja.

## Requisitos

- Docker Desktop, que ya incluye Docker Compose. Se recomienda asignarle al menos 4 GB de memoria en Settings, Resources.
- git, para clonar el repositorio.
- k6, solo para las pruebas de carga.
- Los puertos 8080, 8081, 9090 y 3000 libres en tu equipo.

El proyecto se desarrolló y probó en macOS con Docker Desktop.

## Estructura del repositorio

```
.
├── docker-compose.yml          # los 8 servicios, la red y los volúmenes
├── backend/
│   ├── app.py                  # aplicación Flask con /metrics
│   ├── requirements.txt
│   └── Dockerfile
├── nginx/
│   └── nginx.conf              # proxy inverso, balanceo y stub_status
├── monitoring/
│   ├── prometheus/prometheus.yml
│   └── grafana/
│       ├── provisioning/       # fuente de datos y proveedor de dashboards
│       └── dashboards/         # dashboard en JSON, cargado al arrancar
└── loadtest/
    ├── prueba-carga.js         # prueba 1: carga básica (k6)
    ├── prueba-limite.js        # prueba 2: cerca del límite (k6)
    └── prueba-sobrecarga.js    # prueba 3: sobrecarga (k6)
```

## Cómo levantar la infraestructura

```
git clone https://github.com/JohannaPelaez92/proyecto-final-so-docker.git
cd proyecto-final-so-docker
docker compose up -d --build
```

La primera vez tarda un poco porque descarga las imágenes y construye el backend. Cuando termine, revisa el estado:

```
docker compose ps
```

Deben aparecer los ocho contenedores en ejecución y los tres backends con estado `healthy`. Si Nginx aparece como no iniciado, espera unos segundos: arranca solo cuando los tres backends están sanos.

## Direcciones de acceso

| Servicio   | URL                    | Para qué sirve                                   |
|------------|------------------------|--------------------------------------------------|
| Nginx      | http://localhost:8080  | La aplicación, a través del proxy inverso        |
| Prometheus | http://localhost:9090  | Consultar métricas y ver el estado de los targets |
| Grafana    | http://localhost:3000  | Dashboards (entra sin usuario ni contraseña)     |
| cAdvisor   | http://localhost:8081  | Consumo de recursos de cada contenedor           |

Los puertos se publican únicamente en `127.0.0.1`, así que los servicios solo se pueden abrir desde el mismo equipo y no desde otros dispositivos de la red. Esto importa sobre todo con Grafana, que entra sin usuario ni contraseña y con rol de administrador porque está pensado para uso local. No lo dejes así en un servidor expuesto.

## Verificar el balanceo de carga

Pide la página seis veces seguidas:

```
for i in 1 2 3 4 5 6; do curl -s localhost:8080 | grep Hello; done
```

La respuesta debe rotar entre los tres backends: server 1, server 2, server 3, y volver a empezar. Cada backend también devuelve su nombre en la cabecera `X-Backend`:

```
curl -sI localhost:8080 | grep -i x-backend
```

Para ver a qué backend envió Nginx cada petición, mira sus registros. Cada línea trae `upstream=` con la dirección del backend que respondió:

```
docker compose logs nginx --tail 10
```

Para comprobar que el sistema sigue respondiendo si un backend se cae, apaga uno, repite las peticiones y vuelve a encenderlo:

```
docker compose stop app1
for i in 1 2 3 4 5 6; do curl -s localhost:8080 | grep Hello; done
docker compose start app1
```

Con `app1` apagado las respuestas deben llegar solo de server 2 y server 3, sin errores.

## Verificar el monitoreo

En Prometheus, entra a Status y luego a Target health. Deben aparecer seis targets en estado UP: `prometheus`, `cadvisor`, `nginx-exporter` y los tres backends. Después, en la pestaña Query, prueba esta consulta, que muestra cuántas peticiones ha atendido cada backend:

```
sum by (backend) (flask_http_request_total)
```

En Grafana ya está cargado el dashboard "Proyecto Final: Infraestructura" (menú Dashboards), sin necesidad de importar nada. Muestra el número de targets arriba, las peticiones por segundo de Nginx, las conexiones activas y las respuestas 5xx, además de las gráficas de peticiones por segundo y latencia p95 por backend, y de CPU, memoria, tráfico de red y lectura y escritura de disco de cada contenedor. Sin tráfico, los paneles de peticiones y latencia aparecen vacíos, porque se calculan sobre las peticiones recientes. Genera carga y se llenan.

## Pruebas de carga

Las pruebas se hacen desde la máquina anfitriona con k6. En macOS se instala con Homebrew (en otros sistemas, las instrucciones están en https://grafana.com/docs/k6/latest/set-up/install-k6/):

```
brew install k6
```

Hay tres scripts en `loadtest/`, de menor a mayor exigencia:

| Script                | Qué hace                                                                                  | Duración  |
|-----------------------|-------------------------------------------------------------------------------------------|-----------|
| `prueba-carga.js`     | Sube hasta 50 usuarios virtuales que piden la página principal, con una pausa de 0,2 s    | 1 min 20 s |
| `prueba-limite.js`    | Mantiene 45 peticiones por segundo a `/slow?ms=500`, cerca de la capacidad teórica        | 2 min 10 s |
| `prueba-sobrecarga.js`| Mantiene 100 peticiones por segundo a `/slow?ms=500`, más del doble de la capacidad       | 1 min 40 s |

La ruta `/slow?ms=500` mantiene ocupado un hilo del backend durante 500 ms. Con 3 backends de 8 hilos cada uno, la capacidad teórica es 3 x 8 / 0,5 s = 48 peticiones por segundo, y eso permite saber de antemano dónde está el límite. Las pruebas 2 y 3 fijan cuántas peticiones por segundo llegan, no cuántos usuarios hay. En la prueba 3 se espera que la latencia suba mucho, que el umbral de latencia de k6 se marque como superado y que k6 deje de enviar algunas peticiones al quedarse sin usuarios virtuales (aparece como `dropped_iterations`). Eso forma parte del experimento.

Con la infraestructura arriba y el dashboard de Grafana abierto, ejecuta cada una:

```
k6 run loadtest/prueba-carga.js
k6 run loadtest/prueba-limite.js
k6 run loadtest/prueba-sobrecarga.js
```

Entre una prueba y otra, espera a que las conexiones activas de Nginx vuelvan a 1 o 2, para que la siguiente no arranque con la cola de la anterior. Al terminar, k6 imprime un resumen con el total de peticiones, el porcentaje de fallos y los tiempos de respuesta. Con `--quiet` se omiten las líneas de avance y queda solo el resumen.

## Persistencia de datos

Prometheus y Grafana guardan sus datos en volúmenes de Docker (`prometheus-data` y `grafana-data`). Por eso las mediciones sobreviven a un reinicio:

```
docker compose down
docker compose up -d
```

Después de reiniciar, las gráficas de Prometheus conservan el historial anterior. Para borrar también los datos, usa `docker compose down -v`.

## Decisiones de configuración

- Los backends corren con `gunicorn -w 1 --threads 8`. Con varios procesos, cada uno llevaría sus propios contadores y Prometheus leería cifras distintas en cada visita. Un solo proceso con 8 hilos atiende la misma cantidad de peticiones simultáneas y mantiene las métricas coherentes.
- El `upstream` de Nginx declara una zona de memoria compartida (`zone backend_pool 64k`). Antes de agregarla, justo después de reiniciar la infraestructura las primeras peticiones se iban todas al mismo backend. Con la zona compartida el reparto rotó desde la primera petición.
- El puerto 8088 de Nginx, que expone `stub_status`, no se publica hacia el equipo. Solo el exportador lo lee, dentro de la red de Docker.
- Prometheus consulta cada backend directamente y no a través de Nginx, porque el balanceador mandaría cada visita a `/metrics` a un backend distinto y las cifras quedarían mezcladas.
- cAdvisor necesita `privileged: true` para leer la información de los contenedores desde el sistema.

## Limitaciones conocidas

Durante la prueba de sobrecarga, Prometheus no logra leer las métricas de los tres backends durante poco más de un minuto (`up` cae a 0), y sus gráficas en Grafana quedan con un hueco. En ese lapso, el tiempo que tarda cada lectura (`scrape_duration_seconds`) sube de milisegundos hasta agotar el límite de espera de 5 segundos. La explicación más probable es que los 8 hilos de cada backend están ocupados con peticiones y no hay uno libre para atender `/metrics`, que viaja por el mismo camino que el tráfico. Nginx y cAdvisor siguen reportando con normalidad. Una mejora posible es servir las métricas de los backends por un puerto aparte.

## Apagar

```
docker compose down
```
