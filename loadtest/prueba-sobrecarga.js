import http from 'k6/http';
import { check } from 'k6';

// Prueba 3: sobrecarga.
// La capacidad teórica sigue siendo 48 peticiones por segundo (3 backends x 8 hilos
// / 0,5 s), pero aquí llegan 100 por segundo, más del doble de lo que se puede atender.
// Las peticiones se acumulan en cola, la latencia sube y algunas pasan los 10 s de
// espera que se les da y se cuentan como fallidas.
export const options = {
  scenarios: {
    sobrecarga: {
      executor: 'ramping-arrival-rate',
      startRate: 10,
      timeUnit: '1s',
      preAllocatedVUs: 200,
      maxVUs: 400, // si se agotan, k6 descarta iteraciones (dropped_iterations)
      stages: [
        { target: 100, duration: '30s' }, // sube de 10 a 100 peticiones por segundo
        { target: 100, duration: '60s' }, // se mantiene en 100
        { target: 0, duration: '10s' },   // baja a 0
      ],
    },
  },
  thresholds: {
    // Estos umbrales se esperan superados: es lo que demuestra la sobrecarga
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<1000'],
  },
};

export default function () {
  const res = http.get('http://localhost:8080/slow?ms=500', { timeout: '10s' });
  check(res, { 'status 200': (r) => r.status === 200 });
}
