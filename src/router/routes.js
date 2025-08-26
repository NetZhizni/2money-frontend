export default [
  {
    path: '/',
    name: 'home',
    component: () => import('../pages/MainPage.vue'),
    children: [
      {
        path: '/',
        redirect: '/wallet',
      },
      {
        path: '/wallet',
        name: 'Wallet',
        component: () => import('../views/WalletView.vue'),
      },
      {
        path: '/categories',
        name: 'Categories',
        component: () => import('../views/CategoriesView.vue'),
      },
      {
        path: '/income',
        name: 'Income',
        component: () => import('../views/IncomeView.vue'),
      },
      {
        path: '/expenses',
        name: 'Expenses',
        component: () => import('../views/ExpensesView.vue'),
      },
      {
        path: '/transfer',
        name: 'Transfer',
        component: () => import('../views/TransferView.vue'),
      },
      {
        path: '/monitoring',
        name: 'Monitoring',
        component: () => import('../views/MonitoringView.vue'),
      },
    ],
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: '/',
  },
]
