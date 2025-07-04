import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['react-markdown', 'remark-gfm', 'react-plotly.js', 'plotly.js'],
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'placehold.co',
        port: '',
        pathname: '/**',
      },
    ],
  },
};

export default nextConfig;
