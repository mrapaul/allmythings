{ config, pkgs, ... }:

let
  api_port = 14000;
  app_dir = "/var/lib/allmythings";
in
{
  # 1. PostgreSQL Configuration
  services.postgresql = {
    enable = true;
    package = pkgs.postgresql_15;
    authentication = pkgs.lib.mkForce ''
      # TYPE  DATABASE        USER            ADDRESS                 METHOD
      local   all             all                                     trust
      host    all             all             127.0.0.1/32            trust
      host    all             all             ::1/128                 trust
    '';
    initialScript = pkgs.writeText "init-sql" ''
      CREATE USER allmythings WITH PASSWORD 'allmythings';
      CREATE DATABASE allmythings OWNER allmythings;
    '';
  };

  # 2. API Service (Systemd)
  systemd.services.allmythings-api = {
    description = "All My Things Fastify API Service";
    after = [ "network.target" "postgresql.service" ];
    wantedBy = [ "multi-user.target" ];
    
    serviceConfig = {
      Type = "simple";
      User = "allmythings";
      Group = "allmythings";
      WorkingDirectory = "${app_dir}/api-service";
      ExecStart = "${pkgs.nodejs_20}/bin/node dist/src/index.js";
      Restart = "always";
      Environment = [
        "PORT=${toString api_port}"
        "NODE_ENV=production"
        "DATABASE_URL=postgresql://allmythings:allmythings@localhost:5432/allmythings"
        # Secrets should be handled via sops-nix or environment files
        # "GOOGLE_PROJECT_ID=..."
        # "AWS_ACCESS_KEY_ID=..."
      ];
    };
  };

  # 3. Nginx Reverse Proxy
  services.nginx = {
    enable = true;
    recommendedProxySettings = true;
    recommendedTlsSettings = true;
    
    virtualHosts."api.allmythings.app" = {
      # Add SSL configuration here (e.g., let's encrypt)
      # forceSSL = true;
      # enableACME = true;
      locations."/" = {
        proxyPass = "http://127.0.0.1:${toString api_port}";
        proxyWebsockets = true;
      };
    };
  };

  # 4. Networking & Firewall
  networking.firewall.allowedTCPPorts = [ 80 443 ];

  # 5. Users
  users.users.allmythings = {
    isSystemUser = true;
    group = "allmythings";
    home = app_dir;
    createHome = true;
  };
  users.groups.allmythings = {};

  # 6. Environment Packages
  environment.systemPackages = with pkgs; [
    nodejs_20
    postgresql_15
    git
    vim
  ];
}
