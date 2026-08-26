# Older changes
## 3.0.0 (2026-03-05)
- (lubepi) BREAKING: DNS-01 credentials are encrypted now. You might have to reenter them once after upgrading the aadapter. 
- (copilot) Adapter requires admin >= 7.7.22 now
- (lubepi) Added support for Netcup DNS-01 challenge 
- (@GermanBluefox) Optimisations on log output and error handling

## 2.0.0 (2026-02-12)
- (mcm1957) Adapter requires node.js >= 20, js-controller >= 6.0.11 and admin >= 7.6.17 now
- (mcm1957) Dependencies have been updated
- (@GermanBluefox) Adater was migrated to TypeScript and vite

## 1.0.6 (2024-12-27)

- (mcm1957) Missing size attributes for jsonConfig have been added.
- (mcm1957) Dependencies have been updated

## 1.0.5 (2024-12-08)

- (@GermanBluefox) Corrected error with admin 7.4.3

[Older changelogs can be found there](CHANGELOG_OLD.md)

## 1.0.3 (2024-11-27)

- (@GermanBluefox) Migrated GUI for admin 7 (one more time)

## 1.0.1 (2024-07-06)

- (mcm1957) Adapter requires node.js >= 18 and js-controller >= 5 now
- (mcm1957) Dependencies have been updated
- (bluefox) Prepared for admin v7

## 0.1.2 (2023-11-15)

- (mcm1957) Issues reported by the adapter checker have been fixed.
- (mcm1957) Release 0.1.1 has been released again due to an error during deployment.

## 0.1.1 (2023-11-15)

- (raintonr) Various improvements in start/stop of other adapters using HTTP challenge server port fixing restart loop (#43).
- (raintonr) Fixed ACME notify messages (#64).

## 0.1.0 (2023-08-01)

- (raintonr) Use @iobroker/webserver (#10).
- (bluefox) Corrected detection of instances on the same port
- (bluefox) Implemented the monitoring of the collection's status

## 0.0.2 (2023-03-01)

- (bluefox) Now all running on the same port adapters will be stopped before update.

## 0.0.1 (2023-01-29)
* (Robin Rainton) Initial release.