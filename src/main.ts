import './style.css';
import outputs from '../amplify_outputs.json';
import { bootstrapApp } from './app/bootstrap';
import { configureAmplify } from './backend/amplifyClient';

configureAmplify(outputs);
bootstrapApp();
