import http from 'k6/http';
import { check } from 'k6';

// Prueba 2: cerca del límite.
// Cada petición a /slow?ms=500 ocupa un hilo del backend durante 500 ms.
// Hay 3 backends con 8 hilos cada uno, así que la capacidad teórica es
// 3 x 8 / 0,5 s = 48 peticiones por segundo. Aquí se llega a 45 y se mantiene.
export const options = {
  scenarios: {
    limite: {
      executor: 'ramping-arrival-rate', // fija las peticiones por segundo, no los usuarios
      startRate: 10,
      timeUnit: '1s',
      preAllocatedVUs: 100,
      maxVUs: 300,
      stages: [
        { target: 45, duration: '30s' }, // sube de 10 a 45 peticiones por segundo
        { target: 45, duration: '90s' }, // se mantiene en 45
        { target: 0, duration: '10s' },  // baja a 0
      ],
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],     // menos del 1 % de fallos
    http_req_duration: ['p(95)<1000'],  // el 95 % responde en menos de 1 s
  },
};

export default function () {
  const res = http.get('http://localhost:8080/slow?ms=500');
  check(res, { 'status 200': (r) => r.status === 200 });
}
