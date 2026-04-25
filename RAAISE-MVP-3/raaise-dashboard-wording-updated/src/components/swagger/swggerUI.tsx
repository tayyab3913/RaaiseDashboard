'use client';
import SwaggerUI from 'swagger-ui-react';
import 'swagger-ui/dist/swagger-ui.css';
const SwaggerUIComponent = () => (
  <SwaggerUI url="/api-docs.yaml" />
);
export default SwaggerUIComponent