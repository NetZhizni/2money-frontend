export default [
  {
    path: '/',
    name: 'home',
    component: () => import('../pages/MainPage.vue'),
    children: [
      {
        path: '/',
        redirect: '/accounts',
      },
      {
        path: '/accounts',
        name: 'Accounts',
        component: () => import('../views/AccountsView.vue'),
      },
      {
        path: '/categories',
        name: 'Categories',
        component: () => import('../views/CategoriesView.vue'),
      },
      {
        path: '/overview',
        name: 'Overview',
        component: () => import('../views/OverviewView.vue'),
      },
      {
        path: '/transactions',
        name: 'Transactions',
        component: () => import('../views/TransactionsView.vue'),
      },
    ],
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: '/',
  },
]
