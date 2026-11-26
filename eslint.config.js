import firebaseRulesPlugin from '@firebase/eslint-plugin-security-rules';

export default [
  {
    ignores: ['dist/**/*', 'src/**/*', 'scripts/**/*', 'public/**/*', '*.ts', '*.js']
  },
  firebaseRulesPlugin.configs['flat/recommended']
];
