import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./login/login.page').then(m => m.LoginPage),
  },
  {
    path: '',
    redirectTo: 'login',
    pathMatch: 'full',
  },
  {
    path: 'otp',
    loadComponent: () => import('./otp/otp.page').then(m => m.OtpPage)
  },
  {
    path: 'registration',
    children: [
      {
        path: '',
        loadComponent: () => import('./registration/registration.page').then(m => m.RegistrationPage)
      },
      {
        path: 'otp',
        loadComponent: () => import('./registration/reg-otp/reg-otp.page').then(m => m.RegOtpPage)
      },
      {
        path: 'step2', // Profile Photo
        loadComponent: () => import('./registration/step2/step2.page').then(m => m.Step2Page)
      }
    ]
  },
  {
    path: 'register',
    redirectTo: 'registration',
    pathMatch: 'full'
  },
  {
    path: 'home',
    loadComponent: () => import('./home/home.page').then(m => m.HomePage)
  },
];
